const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../db/schema');
const { isLocked, lockedResponse, recordFailedAttempt, recordSuccess } = require('../services/pinAuth');
const { createShopOwnerAccount, assertEmailFree } = require('../services/accounts');
const { EMAIL_RE, PIN_RE } = require('../utils/validate');
const { HttpError } = require('../utils/errors');

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

  try {
    let student;
    if (role === 'shop_owner') {
      student = await createShopOwnerAccount({ name, email, pin, merchantName, phone });
    } else {
      if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Enter a valid email address');
      if (!PIN_RE.test(String(pin))) throw new HttpError(400, 'PIN must be 4-6 digits');
      await assertEmailFree(email);

      const id      = 'parent-' + uuidv4().slice(0, 8);
      const pinHash = bcrypt.hashSync(String(pin), 10);

      await db.prepare(`
        INSERT INTO students (id, name, email, class, balance, pin_hash, role, phone)
        VALUES (?, ?, ?, 'Parent', 0, ?, 'parent', ?)
      `).run(id, name, email, pinHash, phone || null);

      student = { id, name, email, class: 'Parent', balance: 0, role: 'parent', phone: phone || null };
    }

    res.status(201).json({ token: signToken(student), student });
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json(err.body);
    throw err;
  }
});

// POST /auth/login  — email + PIN
router.post('/login', async (req, res) => {
  const { email, pin } = req.body;
  if (!email || !pin) return res.status(400).json({ error: 'Email and PIN required' });

  const student = await db.prepare('SELECT * FROM students WHERE email = ?').get(email);
  if (!student) return res.status(401).json({ error: 'Invalid credentials' });
  if (!student.active) return res.status(401).json({ error: 'This account has been deactivated' });

  if (isLocked(student)) {
    const { status, body } = lockedResponse(student);
    return res.status(status).json(body);
  }

  const valid = bcrypt.compareSync(String(pin), student.pin_hash);
  if (!valid) {
    await recordFailedAttempt(db, student.id);
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  await recordSuccess(db, student.id);

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
  if (!PIN_RE.test(String(newPin))) {
    return res.status(400).json({ error: 'New PIN must be 4-6 digits' });
  }

  const student = await db.prepare('SELECT * FROM students WHERE email = ?').get(email);
  if (!student) return res.status(401).json({ error: 'Invalid credentials' });

  if (isLocked(student)) {
    const { status, body } = lockedResponse(student);
    return res.status(status).json(body);
  }

  if (!bcrypt.compareSync(String(oldPin), student.pin_hash)) {
    await recordFailedAttempt(db, student.id);
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  await recordSuccess(db, student.id);

  const newHash = bcrypt.hashSync(String(newPin), 10);
  await db.prepare('UPDATE students SET pin_hash = ? WHERE id = ?').run(newHash, student.id);
  res.json({ message: 'PIN updated successfully' });
});

module.exports = router;
