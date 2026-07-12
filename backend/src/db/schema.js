const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
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

// Runs `fn` against a single checked-out client wrapped in BEGIN/COMMIT, so
// callers can SELECT ... FOR UPDATE to lock a row and then read-modify-write
// it atomically (e.g. debiting a wallet) without a lost-update/double-spend
// race between concurrent requests. `fn` receives a `db`-shaped object bound
// to the transaction's client — use it instead of the module-level `db` for
// every query that must participate in the same transaction.
async function withTransaction(fn) {
  const client = await pool.connect();
  const trxDb = { prepare: (sql) => {
    let n = 0;
    const pgSql = sql.replace(/\?/g, () => `$${++n}`);
    return {
      get: async (...params) => (await client.query(pgSql, params)).rows[0],
      all: async (...params) => (await client.query(pgSql, params)).rows,
      run: async (...params) => { await client.query(pgSql, params); },
    };
  } };

  try {
    await client.query('BEGIN');
    const result = await fn(trxDb);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

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

  // PIN brute-force lockout: count consecutive failed PIN checks (login,
  // change-pin, and cashier pay-by-nfc all share pin_hash on this row) and
  // lock the account for a cooldown window once the threshold is hit.
  if (!cols.rows.some((c) => c.column_name === 'failed_pin_attempts')) {
    await pool.query('ALTER TABLE students ADD COLUMN failed_pin_attempts INTEGER NOT NULL DEFAULT 0');
  }
  // TIMESTAMPTZ, not TIMESTAMP: this value is written from Node as a UTC
  // ISO string and read back into a JS Date for a direct comparison against
  // `new Date()`. A plain TIMESTAMP column silently round-trips through the
  // pg driver's *local* time zone (whatever TZ the Node process runs under),
  // shifting the value by the local UTC offset — on an IST host that made a
  // freshly-set lockout appear already expired. TIMESTAMPTZ always resolves
  // to one unambiguous instant regardless of session/process time zone.
  if (!cols.rows.some((c) => c.column_name === 'pin_locked_until')) {
    await pool.query('ALTER TABLE students ADD COLUMN pin_locked_until TIMESTAMPTZ');
  } else {
    const lockColType = await pool.query(
      "SELECT data_type FROM information_schema.columns WHERE table_name = 'students' AND column_name = 'pin_locked_until'"
    );
    if (lockColType.rows[0]?.data_type === 'timestamp without time zone') {
      await pool.query("ALTER TABLE students ALTER COLUMN pin_locked_until TYPE TIMESTAMPTZ USING pin_locked_until AT TIME ZONE 'UTC'");
    }
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
      expires_at    TIMESTAMPTZ NOT NULL
    );
  `);

  // expires_at was originally TIMESTAMP (no time zone). It's written from
  // Node as a UTC ISO string and compared in Node against `new Date()` (see
  // GET /wallet/pending/:id) — the same local-time round-trip bug described
  // above for pin_locked_until, which made a purchase's approval hold appear
  // to expire (almost) immediately instead of after the real timeout on any
  // non-UTC host. Fix existing deployments in place.
  const pendingCols = await pool.query(
    "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'pending_purchases'"
  );
  const expiresAtCol = pendingCols.rows.find((c) => c.column_name === 'expires_at');
  if (expiresAtCol && expiresAtCol.data_type === 'timestamp without time zone') {
    await pool.query("ALTER TABLE pending_purchases ALTER COLUMN expires_at TYPE TIMESTAMPTZ USING expires_at AT TIME ZONE 'UTC'");
  }

  // Link a finalized transaction back to the pending-approval request that
  // produced it, so repeated cashier polls after approval return the same
  // result instead of re-running the debit.
  if (!txnCols.rows.some((c) => c.column_name === 'pending_purchase_id')) {
    await pool.query('ALTER TABLE transactions ADD COLUMN pending_purchase_id TEXT REFERENCES pending_purchases(id)');
  }

  // Admin Panel & Seller Order Listing feature — shops become a first-class
  // entity instead of the free-text merchant_name string on a shop_owner row.
  // merchant_name itself is left untouched so the existing merchant-string
  // matching in shop.js/wallet.js (today's revenue, transaction log) keeps working.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS shops (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      location    TEXT,
      school_id   TEXT,
      active      INTEGER NOT NULL DEFAULT 1,
      created_at  TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  if (!cols.rows.some((c) => c.column_name === 'shop_id')) {
    await pool.query('ALTER TABLE students ADD COLUMN shop_id TEXT REFERENCES shops(id)');
  }
  // Multi-tenancy placeholder — no logic consumes this yet (v1 ships to one school).
  if (!cols.rows.some((c) => c.column_name === 'school_id')) {
    await pool.query('ALTER TABLE students ADD COLUMN school_id TEXT');
  }

  // One row per sale (cart or single-item checkout), separate from the wallet
  // ledger (`transactions`) so seller-facing order queries and refunds don't
  // collide with balance bookkeeping. Written from routes/wallet.js.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id                  TEXT PRIMARY KEY,
      shop_id             TEXT NOT NULL REFERENCES shops(id),
      student_id          TEXT NOT NULL REFERENCES students(id),
      cashier_id          TEXT REFERENCES students(id),
      items               JSONB NOT NULL,
      amount              REAL NOT NULL,
      status              TEXT NOT NULL DEFAULT 'completed'
                            CONSTRAINT orders_status_check CHECK (status IN ('completed', 'pending_approval', 'rejected', 'refund_pending', 'refunded')),
      pending_purchase_id TEXT REFERENCES pending_purchases(id),
      approved_by         TEXT REFERENCES students(id),
      refund_reason       TEXT,
      refunded_at         TIMESTAMPTZ,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_orders_shop_created ON orders(shop_id, created_at DESC);
  `);

  if (!txnCols.rows.some((c) => c.column_name === 'order_id')) {
    await pool.query('ALTER TABLE transactions ADD COLUMN order_id TEXT REFERENCES orders(id)');
  }

  // Time-in-queue reporting for the admin approvals view (GET /admin/approvals).
  if (!pendingCols.rows.some((c) => c.column_name === 'resolved_at')) {
    await pool.query('ALTER TABLE pending_purchases ADD COLUMN resolved_at TIMESTAMPTZ');
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id          TEXT PRIMARY KEY,
      actor_id    TEXT REFERENCES students(id),
      actor_role  TEXT NOT NULL,
      action      TEXT NOT NULL,
      entity      TEXT NOT NULL,
      entity_id   TEXT NOT NULL,
      before      JSONB,
      after       JSONB,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Seed demo data only if empty, and never in production (predictable demo PINs
  // must not be auto-provisioned on a real deploy)
  const existing = await db.prepare('SELECT id FROM students WHERE email = ?').get('admin@studpay.school');
  if (!existing && process.env.NODE_ENV !== 'production') {
    const ownerPin   = bcrypt.hashSync('1234', 10);
    const owner2Pin  = bcrypt.hashSync('1111', 10);
    const owner3Pin  = bcrypt.hashSync('2222', 10);
    const principalPin = bcrypt.hashSync('9999', 10);
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

    // School admin (school-wide roster/analytics/staff-management login)
    await insertUser.run('schooladmin-001', 'Principal', 'principal@studpay.school', 'Admin', 0, principalPin, 'school_admin', null);

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
    console.log('   School admin: principal@studpay.school (9999)');
    console.log('   Shop owners : admin@studpay.school (1234, School Canteen)');
    console.log('                 bookstore@studpay.school (1111, School Book Store)');
    console.log('                 stationery@studpay.school (2222, Stationery Corner)');
    console.log('   Parents     : lakshmi.menon@student.school (2468) -> Arjun Menon');
    console.log('                 suresh.nair@student.school (1357) -> Priya Nair, Ananya Nair');
    console.log('                 deepa.sharma@student.school (8642) -> Rahul Sharma, Kiran Sharma');
    console.log('   Students    : arjun/priya/rahul/ananya.nair/kiran.sharma@student.school (PIN 5678)');
  }

  // Production bootstrap: opt-in, idempotent creation of the first
  // school_admin account on a real deploy (the block above only seeds one
  // in dev/demo). Safe to leave SEED_ADMIN_EMAIL/SEED_ADMIN_PIN set
  // permanently — this only ever inserts once, and only if no school_admin
  // exists yet. Further admins are created via POST /admin/school-admins.
  if (process.env.SEED_ADMIN_EMAIL && process.env.SEED_ADMIN_PIN) {
    const existingAdmin = await db.prepare("SELECT id FROM students WHERE role = 'school_admin' LIMIT 1").get();
    if (!existingAdmin) {
      const adminPinHash = bcrypt.hashSync(String(process.env.SEED_ADMIN_PIN), 10);
      await db.prepare(`
        INSERT INTO students (id, name, email, class, balance, pin_hash, role)
        VALUES (?, 'School Admin', ?, 'Admin', 0, ?, 'school_admin')
      `).run('schooladmin-' + uuidv4().slice(0, 8), process.env.SEED_ADMIN_EMAIL, adminPinHash);
      console.log(`✅ Bootstrapped school admin account: ${process.env.SEED_ADMIN_EMAIL}`);
    }
  }

  // Backfill: give every shop_owner without a shop_id a shops row, derived
  // from their existing merchant_name (matched by name — the app has no other
  // way to tell two owners apart as "the same shop" today). Covers both
  // pre-existing rows on a real deploy and the demo rows seeded above.
  // Idempotent — only touches rows where shop_id IS NULL, so it's safe to
  // run on every startup.
  const unassignedOwners = await db.prepare(
    "SELECT id, merchant_name FROM students WHERE role = 'shop_owner' AND shop_id IS NULL"
  ).all();
  for (const owner of unassignedOwners) {
    const name = owner.merchant_name || 'Shop';
    let shop = await db.prepare('SELECT id FROM shops WHERE name = ?').get(name);
    if (!shop) {
      const shopId = 'shop-' + uuidv4().slice(0, 8);
      await db.prepare('INSERT INTO shops (id, name) VALUES (?, ?)').run(shopId, name);
      shop = { id: shopId };
    }
    await db.prepare('UPDATE students SET shop_id = ? WHERE id = ?').run(shop.id, owner.id);
  }
}

function datetime(daysOffset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  return d.toISOString().replace('T', ' ').slice(0, 19);
}

module.exports = { db, initDB, withTransaction };
