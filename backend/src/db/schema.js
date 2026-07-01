// Uses Node.js 22.5+ built-in SQLite — no npm package needed
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const bcrypt = require('bcrypt');
require('dotenv').config();

const db = new DatabaseSync(path.resolve(process.env.DB_PATH || './studpay.db'));

function initDB() {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS students (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      email       TEXT UNIQUE NOT NULL,
      class       TEXT NOT NULL,
      balance     REAL NOT NULL DEFAULT 0,
      pin_hash    TEXT NOT NULL,
      role        TEXT NOT NULL DEFAULT 'student',
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS cards (
      id          TEXT PRIMARY KEY,
      uid         TEXT UNIQUE NOT NULL,
      student_id  TEXT NOT NULL,
      active      INTEGER NOT NULL DEFAULT 1,
      linked_at   TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (student_id) REFERENCES students(id)
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id            TEXT PRIMARY KEY,
      student_id    TEXT NOT NULL,
      type          TEXT NOT NULL,
      amount        REAL NOT NULL,
      description   TEXT NOT NULL,
      merchant      TEXT,
      balance_after REAL NOT NULL,
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (student_id) REFERENCES students(id)
    );
  `);

  // Seed demo data only if empty
  const existing = db.prepare('SELECT id FROM students WHERE email = ?').get('admin@studpay.school');
  if (!existing) {
    const adminPin   = bcrypt.hashSync('1234', 10);
    const studentPin = bcrypt.hashSync('5678', 10);

    db.prepare(`INSERT INTO students (id,name,email,class,balance,pin_hash,role) VALUES (?,?,?,?,?,?,?)`)
      .run('admin-001', 'Admin User', 'admin@studpay.school', 'Staff', 0, adminPin, 'admin');

    db.prepare(`INSERT INTO students (id,name,email,class,balance,pin_hash,role) VALUES (?,?,?,?,?,?,?)`)
      .run('stu-001', 'Arjun Menon', 'arjun@student.school', '10-A', 500, studentPin, 'student');

    db.prepare(`INSERT INTO students (id,name,email,class,balance,pin_hash,role) VALUES (?,?,?,?,?,?,?)`)
      .run('stu-002', 'Priya Nair', 'priya@student.school', '9-B', 320, studentPin, 'student');

    db.prepare(`INSERT INTO students (id,name,email,class,balance,pin_hash,role) VALUES (?,?,?,?,?,?,?)`)
      .run('stu-003', 'Rahul Sharma', 'rahul@student.school', '11-C', 90, studentPin, 'student');

    db.prepare(`INSERT INTO cards (id,uid,student_id) VALUES (?,?,?)`)
      .run('card-001', 'A1B2C3D4', 'stu-001');

    db.prepare(`INSERT INTO cards (id,uid,student_id) VALUES (?,?,?)`)
      .run('card-002', 'F4E3D2C1', 'stu-002');

    // Seed some transactions
    const txnStmt = db.prepare(`
      INSERT INTO transactions (id,student_id,type,amount,description,merchant,balance_after,created_at)
      VALUES (?,?,?,?,?,?,?,?)
    `);
    txnStmt.run('txn-001','stu-001','debit', 50,'Lunch Combo','School Canteen',450, datetime(-1));
    txnStmt.run('txn-002','stu-001','credit',200,'Wallet Top-Up','Parent Top-Up', 500, datetime(-2));
    txnStmt.run('txn-003','stu-001','debit', 20,'Library Fine','Library',        300, datetime(-3));
    txnStmt.run('txn-004','stu-002','debit', 30,'Snacks','School Canteen',       290, datetime(-1));
    txnStmt.run('txn-005','stu-002','credit',200,'Wallet Top-Up','Parent Top-Up',320, datetime(-2));

    console.log('✅ Database seeded');
    console.log('   Student : arjun@student.school  / PIN 5678');
    console.log('   Admin   : admin@studpay.school  / PIN 1234');
    console.log('   NFC UIDs: A1B2C3D4 (Arjun), F4E3D2C1 (Priya)');
  }
}

function datetime(daysOffset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  return d.toISOString().replace('T', ' ').slice(0, 19);
}

module.exports = { db, initDB };
