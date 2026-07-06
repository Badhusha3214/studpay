const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../db/schema');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PIN_RE   = /^\d{4,6}$/;

function signToken(student) {
  return jwt.sign(
    { id: student.id, role: student.role, name: student.name },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN }
  );
}

// POST /auth/register — self-service sign-up for parents and shop owners.
// Students are intentionally excluded: they're only created by a parent (linked
// by surname) or a shop owner, never via public registration.
router.post('/register', async (req, res) => {
  const { name, email, pin, role, phone, merchantName } = req.body;

  if (!name || !email || !pin || !role) {
    return res.status(400).json({ error: 'name, email, pin and role are required' });
  }
  if (!['parent', 'shop_owner'].includes(role)) {
    return res.status(400).json({ error: 'role must be parent or shop_owner' });
  }
  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'Enter a valid email address' });
  }
  if (!PIN_RE.test(String(pin))) {
    return res.status(400).json({ error: 'PIN must be 4-6 digits' });
  }
  if (role === 'shop_owner' && !merchantName) {
    return res.status(400).json({ error: 'merchantName is required for shop owner accounts' });
  }

  const existing = await db.prepare('SELECT id FROM students WHERE email = ?').get(email);
  if (existing) return res.status(409).json({ error: 'Email already registered' });

  const id      = (role === 'parent' ? 'parent-' : 'owner-') + uuidv4().slice(0, 8);
  const pinHash = bcrypt.hashSync(String(pin), 10);
  const cls     = role === 'parent' ? 'Parent' : 'Staff';

  await db.prepare(`
    INSERT INTO students (id, name, email, class, balance, pin_hash, role, merchant_name, phone)
    VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?)
  `).run(id, name, email, cls, pinHash, role, role === 'shop_owner' ? merchantName : null, phone || null);

  const student = {
    id, name, email, class: cls, balance: 0, role,
    merchant_name: role === 'shop_owner' ? merchantName : null,
    phone: phone || null,
  };

  res.status(201).json({ token: signToken(student), student });
});

// POST /auth/login  — email + PIN
router.post('/login', async (req, res) => {
  const { email, pin } = req.body;
  if (!email || !pin) return res.status(400).json({ error: 'Email and PIN required' });

  const student = await db.prepare('SELECT * FROM students WHERE email = ?').get(email);
  if (!student) return res.status(401).json({ error: 'Invalid credentials' });
  if (!student.active) return res.status(401).json({ error: 'This account has been deactivated' });

  const valid = bcrypt.compareSync(String(pin), student.pin_hash);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

  res.json({
    token: signToken(student),
    student: {
      id: student.id,
      name: student.name,
      email: student.email,
      class: student.class,
      balance: student.balance,
      role: student.role,
      merchant_name: student.merchant_name,
    },
  });
});

// POST /auth/change-pin
router.post('/change-pin', async (req, res) => {
  const { email, oldPin, newPin } = req.body;
  const student = await db.prepare('SELECT * FROM students WHERE email = ?').get(email);
  if (!student || !bcrypt.compareSync(String(oldPin), student.pin_hash)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const newHash = bcrypt.hashSync(String(newPin), 10);
  await db.prepare('UPDATE students SET pin_hash = ? WHERE id = ?').run(newHash, student.id);
  res.json({ message: 'PIN updated successfully' });
});

module.exports = router;
