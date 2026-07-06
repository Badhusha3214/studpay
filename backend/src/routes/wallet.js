const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const { db } = require('../db/schema');
const { authMiddleware, shopOwnerMiddleware } = require('../middleware/auth');

// GET /wallet/balance
router.get('/balance', authMiddleware, async (req, res) => {
  const student = await db.prepare('SELECT id, name, email, class, balance FROM students WHERE id = ?').get(req.user.id);
  if (!student) return res.status(404).json({ error: 'Student not found' });
  res.json(student);
});

// GET /wallet/history
router.get('/history', authMiddleware, async (req, res) => {
  const txns = await db.prepare(
    'SELECT * FROM transactions WHERE student_id = ? ORDER BY created_at DESC LIMIT 50'
  ).all(req.user.id);
  res.json(txns);
});

// POST /wallet/topup  — admin only
router.post('/topup', authMiddleware, shopOwnerMiddleware, async (req, res) => {
  const { studentId, amount } = req.body;
  if (!studentId || !amount || amount <= 0) return res.status(400).json({ error: 'Invalid request' });

  const student = await db.prepare('SELECT * FROM students WHERE id = ?').get(studentId);
  if (!student) return res.status(404).json({ error: 'Student not found' });

  const newBalance = student.balance + Number(amount);
  await db.prepare('UPDATE students SET balance = ? WHERE id = ?').run(newBalance, studentId);

  await db.prepare(`
    INSERT INTO transactions (id, student_id, type, amount, description, merchant, balance_after)
    VALUES (?, ?, 'credit', ?, 'Wallet Top-Up', 'Parent/Admin', ?)
  `).run(uuidv4(), studentId, Number(amount), newBalance);

  res.json({ message: 'Wallet topped up', newBalance });
});

// POST /wallet/pay  — NFC payment
router.post('/pay', authMiddleware, async (req, res) => {
  const { amount, description, merchant } = req.body;
  if (!amount || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });

  const student = await db.prepare('SELECT * FROM students WHERE id = ?').get(req.user.id);
  if (!student) return res.status(404).json({ error: 'Student not found' });

  if (student.balance < amount) {
    return res.status(400).json({ error: 'Insufficient balance' });
  }

  const newBalance = student.balance - Number(amount);
  await db.prepare('UPDATE students SET balance = ? WHERE id = ?').run(newBalance, req.user.id);

  const txn = {
    id: uuidv4(),
    student_id: req.user.id,
    type: 'debit',
    amount: Number(amount),
    description: description || 'Payment',
    merchant: merchant || 'School',
    balance_after: newBalance,
  };

  await db.prepare(`
    INSERT INTO transactions (id, student_id, type, amount, description, merchant, balance_after)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(txn.id, txn.student_id, txn.type, txn.amount, txn.description, txn.merchant, txn.balance_after);

  res.json({ message: 'Payment successful', transaction: txn, newBalance });
});

// POST /wallet/pay-by-nfc — cashier terminal: uid + student PIN + amount
router.post('/pay-by-nfc', authMiddleware, shopOwnerMiddleware, async (req, res) => {
  const { uid, pin, amount, description, merchant } = req.body;
  if (!uid || !pin || !amount || amount <= 0) {
    return res.status(400).json({ error: 'uid, pin and amount are required' });
  }

  const card = await db.prepare(`
    SELECT s.*, c.uid FROM cards c
    JOIN students s ON s.id = c.student_id
    WHERE c.uid = ? AND c.active = 1
  `).get(uid);

  if (!card) return res.status(404).json({ error: 'Card not found or inactive' });

  const validPin = bcrypt.compareSync(String(pin), card.pin_hash);
  if (!validPin) return res.status(401).json({ error: 'Invalid PIN' });

  if (card.balance < amount) {
    return res.status(400).json({ error: 'Insufficient balance' });
  }

  const newBalance = card.balance - Number(amount);
  await db.prepare('UPDATE students SET balance = ? WHERE id = ?').run(newBalance, card.id);

  const txn = {
    id:           uuidv4(),
    student_id:   card.id,
    type:         'debit',
    amount:       Number(amount),
    description:  description || 'Payment',
    merchant:     merchant || 'School',
    balance_after: newBalance,
    created_at:   new Date().toISOString().replace('T', ' ').slice(0, 19),
  };

  await db.prepare(`
    INSERT INTO transactions (id, student_id, type, amount, description, merchant, balance_after)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(txn.id, txn.student_id, txn.type, txn.amount, txn.description, txn.merchant, txn.balance_after);

  res.json({
    message: 'Payment successful',
    transaction: txn,
    student: { name: card.name, class: card.class, newBalance },
  });
});

module.exports = router;
