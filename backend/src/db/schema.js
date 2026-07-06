const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const isLocal = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL || '');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isLocal ? false : { rejectUnauthorized: false },
});

// Compatibility shim so route files can keep using the same
// db.prepare(sql).get/.all/.run(...) shape they used with node:sqlite,
// instead of rewriting every call site into pool.query() + $n placeholders.
function prepare(sql) {
  let n = 0;
  const pgSql = sql.replace(/\?/g, () => `$${++n}`);
  return {
    get: async (...params) => (await pool.query(pgSql, params)).rows[0],
    all: async (...params) => (await pool.query(pgSql, params)).rows,
    run: async (...params) => { await pool.query(pgSql, params); },
  };
}

const db = { prepare };

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS students (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      email       TEXT UNIQUE NOT NULL,
      class       TEXT NOT NULL,
      balance     REAL NOT NULL DEFAULT 0,
      pin_hash    TEXT NOT NULL,
      role        TEXT NOT NULL DEFAULT 'student',
      created_at  TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS cards (
      id          TEXT PRIMARY KEY,
      uid         TEXT UNIQUE NOT NULL,
      student_id  TEXT NOT NULL REFERENCES students(id),
      active      INTEGER NOT NULL DEFAULT 1,
      linked_at   TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id            TEXT PRIMARY KEY,
      student_id    TEXT NOT NULL REFERENCES students(id),
      type          TEXT NOT NULL,
      amount        REAL NOT NULL,
      description   TEXT NOT NULL,
      merchant      TEXT,
      balance_after REAL NOT NULL,
      created_at    TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  // Migrate legacy 'admin' role (school-staff) to 'shop_owner' (billing app login)
  await pool.query("UPDATE students SET role = 'shop_owner' WHERE role = 'admin'");

  // Add merchant_name column if it doesn't exist yet (shop-owner's fixed sale location)
  const cols = await pool.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name = 'students'"
  );
  if (!cols.rows.some((c) => c.column_name === 'merchant_name')) {
    await pool.query('ALTER TABLE students ADD COLUMN merchant_name TEXT');
  }

  // Add active column if it doesn't exist yet (soft-delete / archive flag)
  if (!cols.rows.some((c) => c.column_name === 'active')) {
    await pool.query('ALTER TABLE students ADD COLUMN active INTEGER NOT NULL DEFAULT 1');
  }

  // Backfill a default shop name for any shop_owner migrated from the old admin role
  await pool.query(
    "UPDATE students SET merchant_name = 'School Canteen' WHERE role = 'shop_owner' AND merchant_name IS NULL"
  );

  // Add daily spending-limit columns (nullable — no limit set by default)
  if (!cols.rows.some((c) => c.column_name === 'daily_limit_amount')) {
    await pool.query('ALTER TABLE students ADD COLUMN daily_limit_amount REAL');
  }
  if (!cols.rows.some((c) => c.column_name === 'daily_limit_count')) {
    await pool.query('ALTER TABLE students ADD COLUMN daily_limit_count INTEGER');
  }

  // Add phone column (parent's own contact number)
  if (!cols.rows.some((c) => c.column_name === 'phone')) {
    await pool.query('ALTER TABLE students ADD COLUMN phone TEXT');
  }

  // Add allergies column (parent-editable; surfaced to shop owners at checkout for food safety)
  if (!cols.rows.some((c) => c.column_name === 'allergies')) {
    await pool.query('ALTER TABLE students ADD COLUMN allergies TEXT');
  }

  // Add emergency fund balance — a separate reserve parents can deposit into.
  // Kept apart from the spendable `balance`; only drawn on automatically when
  // a payment's main balance is insufficient (see wallet.js).
  if (!cols.rows.some((c) => c.column_name === 'emergency_balance')) {
    await pool.query('ALTER TABLE students ADD COLUMN emergency_balance REAL NOT NULL DEFAULT 0');
  }

  // Track how much of each transaction drew on (or added to) the emergency fund
  const txnCols = await pool.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name = 'transactions'"
  );
  if (!txnCols.rows.some((c) => c.column_name === 'emergency_amount')) {
    await pool.query('ALTER TABLE transactions ADD COLUMN emergency_amount REAL NOT NULL DEFAULT 0');
  }

  // Purchase Insights feature — canteen menu catalog, categorized for health/spending reports
  await pool.query(`
    CREATE TABLE IF NOT EXISTS menu_items (
      id       TEXT PRIMARY KEY,
      name     TEXT NOT NULL,
      category TEXT NOT NULL CONSTRAINT menu_items_category_check CHECK (category IN ('junk', 'healthy', 'beverage', 'snack', 'meal')),
      price    REAL NOT NULL,
      active   INTEGER NOT NULL DEFAULT 1
    );
  `);

  // Link transactions to the menu item purchased (nullable — older/manual transactions have no item)
  if (!txnCols.rows.some((c) => c.column_name === 'item_id')) {
    await pool.query('ALTER TABLE transactions ADD COLUMN item_id TEXT REFERENCES menu_items(id)');
  }

  // Scope menu items to the shop owner who created them — each shop manages
  // its own catalog only (a Book Store owner must not see/sell the Canteen's items)
  const menuCols = await pool.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name = 'menu_items'"
  );
  if (!menuCols.rows.some((c) => c.column_name === 'shop_owner_id')) {
    await pool.query('ALTER TABLE menu_items ADD COLUMN shop_owner_id TEXT REFERENCES students(id)');
  }
  // Backfill any rows from before this migration (no-op on a fresh DB)
  await pool.query("UPDATE menu_items SET shop_owner_id = 'owner-001' WHERE shop_owner_id IS NULL");

  // Widen the category enum for non-food shops (Book Store, Stationery Corner).
  // The table may already exist from a prior deploy with the old 5-value CHECK,
  // so refresh the constraint unconditionally rather than relying on
  // CREATE TABLE IF NOT EXISTS, which is a no-op once the table already exists.
  await pool.query('ALTER TABLE menu_items DROP CONSTRAINT IF EXISTS menu_items_category_check');
  await pool.query(`
    ALTER TABLE menu_items ADD CONSTRAINT menu_items_category_check
    CHECK (category IN ('junk', 'healthy', 'beverage', 'snack', 'meal', 'other'))
  `);

  // Parent-approval hold for junk-food purchases by young students (grade <= 5).
  // A purchase requiring approval sits here — unbilled — until a parent rejects
  // it or the timeout elapses and a cashier poll auto-approves it (see wallet.js).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS pending_purchases (
      id            TEXT PRIMARY KEY,
      student_id    TEXT NOT NULL REFERENCES students(id),
      shop_owner_id TEXT NOT NULL REFERENCES students(id),
      amount        REAL NOT NULL,
      description   TEXT NOT NULL,
      merchant      TEXT,
      item_id       TEXT REFERENCES menu_items(id),
      cart_json     TEXT,
      status        TEXT NOT NULL DEFAULT 'pending' CONSTRAINT pending_purchases_status_check CHECK (status IN ('pending', 'approved', 'rejected')),
      created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
      expires_at    TIMESTAMP NOT NULL
    );
  `);

  // Link a finalized transaction back to the pending-approval request that
  // produced it, so repeated cashier polls after approval return the same
  // result instead of re-running the debit.
  if (!txnCols.rows.some((c) => c.column_name === 'pending_purchase_id')) {
    await pool.query('ALTER TABLE transactions ADD COLUMN pending_purchase_id TEXT REFERENCES pending_purchases(id)');
  }

  // Seed demo data only if empty, and never in production (predictable demo PINs
  // must not be auto-provisioned on a real deploy)
  const existing = await db.prepare('SELECT id FROM students WHERE email = ?').get('admin@studpay.school');
  if (!existing && process.env.NODE_ENV !== 'production') {
    const ownerPin   = bcrypt.hashSync('1234', 10);
    const owner2Pin  = bcrypt.hashSync('1111', 10);
    const owner3Pin  = bcrypt.hashSync('2222', 10);
    const parentPin  = bcrypt.hashSync('2468', 10);
    const parent2Pin = bcrypt.hashSync('1357', 10);
    const parent3Pin = bcrypt.hashSync('8642', 10);
    const studentPin = bcrypt.hashSync('5678', 10);

    const insertUser = db.prepare(
      'INSERT INTO students (id,name,email,class,balance,pin_hash,role,merchant_name) VALUES (?,?,?,?,?,?,?,?)'
    );

    // Shop owners (billing app logins)
    await insertUser.run('owner-001', 'Shop Owner',        'admin@studpay.school',      'Staff', 0, ownerPin,  'shop_owner', 'School Canteen');
    await insertUser.run('owner-002', 'Book Store Owner',  'bookstore@studpay.school',  'Staff', 0, owner2Pin, 'shop_owner', 'School Book Store');
    await insertUser.run('owner-003', 'Stationery Owner',  'stationery@studpay.school', 'Staff', 0, owner3Pin, 'shop_owner', 'Stationery Corner');

    // Demo menu items for the Canteen (owner-001) — seeded here, after shop
    // owners exist, since menu_items.shop_owner_id has a FK to students(id)
    const insertItem = db.prepare(
      'INSERT INTO menu_items (id,name,category,price,active,shop_owner_id) VALUES (?,?,?,?,1,?)'
    );
    await insertItem.run('item-001', 'Samosa',         'junk',     15, 'owner-001');
    await insertItem.run('item-002', 'Masala Chips',   'junk',     10, 'owner-001');
    await insertItem.run('item-003', 'Veg Sandwich',   'healthy',  30, 'owner-001');
    await insertItem.run('item-004', 'Fruit Bowl',      'healthy', 25, 'owner-001');
    await insertItem.run('item-005', 'Cold Drink',      'beverage', 20, 'owner-001');
    await insertItem.run('item-006', 'Fresh Juice',     'beverage', 25, 'owner-001');
    await insertItem.run('item-007', 'Chocolate Bar',   'snack',   12, 'owner-001');
    await insertItem.run('item-008', 'Lunch Combo',     'meal',    50, 'owner-001');
    console.log('✅ Menu items seeded');

    // Parents (frontend app logins) — linked to children by surname + email domain
    await insertUser.run('parent-001', 'Lakshmi Menon', 'lakshmi.menon@student.school', 'Parent', 0, parentPin,  'parent', null);
    await insertUser.run('parent-002', 'Suresh Nair',    'suresh.nair@student.school',  'Parent', 0, parent2Pin, 'parent', null);
    await insertUser.run('parent-003', 'Deepa Sharma',   'deepa.sharma@student.school', 'Parent', 0, parent3Pin, 'parent', null);

    // Students
    await insertUser.run('stu-001', 'Arjun Menon',  'arjun@student.school',       '10-A', 500, studentPin, 'student', null);
    await insertUser.run('stu-002', 'Priya Nair',   'priya@student.school',      '9-B',  320, studentPin, 'student', null);
    await insertUser.run('stu-003', 'Rahul Sharma', 'rahul@student.school',      '11-C', 90,  studentPin, 'student', null);
    await insertUser.run('stu-004', 'Ananya Nair',  'ananya.nair@student.school', '8-A', 200, studentPin, 'student', null);
    await insertUser.run('stu-005', 'Kiran Sharma', 'kiran.sharma@student.school', '7-B', 150, studentPin, 'student', null);

    const insertCard = db.prepare('INSERT INTO cards (id,uid,student_id) VALUES (?,?,?)');
    await insertCard.run('card-001', 'A1B2C3D4', 'stu-001');
    await insertCard.run('card-002', 'F4E3D2C1', 'stu-002');
    await insertCard.run('card-003', '11223344', 'stu-003');
    await insertCard.run('card-004', '55667788', 'stu-004');
    await insertCard.run('card-005', '99AABBCC', 'stu-005');

    // Seed some transactions across all three shops
    const txnStmt = db.prepare(`
      INSERT INTO transactions (id,student_id,type,amount,description,merchant,balance_after,created_at,item_id)
      VALUES (?,?,?,?,?,?,?,?,?)
    `);
    await txnStmt.run('txn-001', 'stu-001', 'debit',  50,  'Lunch Combo',       'School Canteen',    450, datetime(-1), 'item-008');
    await txnStmt.run('txn-002', 'stu-001', 'credit', 200, 'Wallet Top-Up',     'Parent Top-Up',     500, datetime(-2), null);
    await txnStmt.run('txn-003', 'stu-001', 'debit',  20,  'Notebook Set',      'School Book Store', 300, datetime(-3), null);
    await txnStmt.run('txn-004', 'stu-002', 'debit',  30,  'Snacks',            'School Canteen',    290, datetime(-1), 'item-002');
    await txnStmt.run('txn-005', 'stu-002', 'credit', 200, 'Wallet Top-Up',     'Parent Top-Up',     320, datetime(-2), null);
    await txnStmt.run('txn-006', 'stu-003', 'debit',  15,  'Pencil Box',        'Stationery Corner',  75, datetime(-1), null);
    await txnStmt.run('txn-007', 'stu-003', 'credit', 100, 'Wallet Top-Up',     'Parent Top-Up',      90, datetime(-4), null);
    await txnStmt.run('txn-008', 'stu-004', 'debit',  25,  'Textbook - Science','School Book Store', 175, datetime(-2), null);
    await txnStmt.run('txn-009', 'stu-004', 'credit', 200, 'Wallet Top-Up',     'Parent Top-Up',     200, datetime(-5), null);
    await txnStmt.run('txn-010', 'stu-005', 'debit',  10,  'Sketch Pens',       'Stationery Corner', 140, datetime(-1), null);
    await txnStmt.run('txn-011', 'stu-005', 'debit',  40,  'Lunch Combo',       'School Canteen',    150, datetime(-3), 'item-008');

    console.log('✅ Database seeded');
    console.log('   Shop owners : admin@studpay.school (1234, School Canteen)');
    console.log('                 bookstore@studpay.school (1111, School Book Store)');
    console.log('                 stationery@studpay.school (2222, Stationery Corner)');
    console.log('   Parents     : lakshmi.menon@student.school (2468) -> Arjun Menon');
    console.log('                 suresh.nair@student.school (1357) -> Priya Nair, Ananya Nair');
    console.log('                 deepa.sharma@student.school (8642) -> Rahul Sharma, Kiran Sharma');
    console.log('   Students    : arjun/priya/rahul/ananya.nair/kiran.sharma@student.school (PIN 5678)');
  }
}

function datetime(daysOffset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  return d.toISOString().replace('T', ' ').slice(0, 19);
}

module.exports = { db, initDB };
