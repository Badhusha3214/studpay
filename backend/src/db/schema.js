const { Pool } = require('pg');
const bcrypt = require('bcrypt');
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

  // Backfill a default shop name for any shop_owner migrated from the old admin role
  await pool.query(
    "UPDATE students SET merchant_name = 'School Canteen' WHERE role = 'shop_owner' AND merchant_name IS NULL"
  );

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
      INSERT INTO transactions (id,student_id,type,amount,description,merchant,balance_after,created_at)
      VALUES (?,?,?,?,?,?,?,?)
    `);
    await txnStmt.run('txn-001', 'stu-001', 'debit',  50,  'Lunch Combo',       'School Canteen',    450, datetime(-1));
    await txnStmt.run('txn-002', 'stu-001', 'credit', 200, 'Wallet Top-Up',     'Parent Top-Up',     500, datetime(-2));
    await txnStmt.run('txn-003', 'stu-001', 'debit',  20,  'Notebook Set',      'School Book Store', 300, datetime(-3));
    await txnStmt.run('txn-004', 'stu-002', 'debit',  30,  'Snacks',            'School Canteen',    290, datetime(-1));
    await txnStmt.run('txn-005', 'stu-002', 'credit', 200, 'Wallet Top-Up',     'Parent Top-Up',     320, datetime(-2));
    await txnStmt.run('txn-006', 'stu-003', 'debit',  15,  'Pencil Box',        'Stationery Corner',  75, datetime(-1));
    await txnStmt.run('txn-007', 'stu-003', 'credit', 100, 'Wallet Top-Up',     'Parent Top-Up',      90, datetime(-4));
    await txnStmt.run('txn-008', 'stu-004', 'debit',  25,  'Textbook - Science','School Book Store', 175, datetime(-2));
    await txnStmt.run('txn-009', 'stu-004', 'credit', 200, 'Wallet Top-Up',     'Parent Top-Up',     200, datetime(-5));
    await txnStmt.run('txn-010', 'stu-005', 'debit',  10,  'Sketch Pens',       'Stationery Corner', 140, datetime(-1));
    await txnStmt.run('txn-011', 'stu-005', 'debit',  40,  'Lunch Combo',       'School Canteen',    150, datetime(-3));

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
