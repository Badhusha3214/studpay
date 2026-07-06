const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db } = require('../db/schema');

// POST /auth/login  — email + PIN
router.post('/login', async (req, res) => {
  const { email, pin } = req.body;
  if (!email || !pin) return res.status(400).json({ error: 'Email and PIN required' });

  const student = await db.prepare('SELECT * FROM students WHERE email = ?').get(email);
  if (!student) return res.status(401).json({ error: 'Invalid credentials' });
  if (!student.active) return res.status(401).json({ error: 'This account has been deactivated' });

  const valid = bcrypt.compareSync(String(pin), student.pin_hash);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

  const token = jwt.sign(
    { id: student.id, role: student.role, name: student.name },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN }
  );

  res.json({
    token,
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
