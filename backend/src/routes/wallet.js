const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const { db } = require('../db/schema');
const { authMiddleware, shopOwnerMiddleware } = require('../middleware/auth');
const { getParentFor } = require('../services/family');

// GET /wallet/balance
router.get('/balance', authMiddleware, async (req, res) => {
  const student = await db.prepare(
    'SELECT id, name, email, class, balance, emergency_balance, allergies FROM students WHERE id = ?'
  ).get(req.user.id);
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

  const totalAvailable = student.balance + (student.emergency_balance || 0);
  if (totalAvailable < amount) {
    return res.status(400).json({ error: 'Insufficient balance' });
  }

  // Draw from the main balance first; any shortfall is auto-covered by the emergency fund.
  const fromMain = Math.min(student.balance, Number(amount));
  const fromEmergency = Number(amount) - fromMain;
  const newBalance = student.balance - fromMain;
  const newEmergencyBalance = (student.emergency_balance || 0) - fromEmergency;
  await db.prepare('UPDATE students SET balance = ?, emergency_balance = ? WHERE id = ?')
    .run(newBalance, newEmergencyBalance, req.user.id);

  const txn = {
    id: uuidv4(),
    student_id: req.user.id,
    type: 'debit',
    amount: Number(amount),
    description: description || 'Payment',
    merchant: merchant || 'School',
    balance_after: newBalance,
    emergency_amount: fromEmergency,
  };

  await db.prepare(`
    INSERT INTO transactions (id, student_id, type, amount, description, merchant, balance_after, emergency_amount)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(txn.id, txn.student_id, txn.type, txn.amount, txn.description, txn.merchant, txn.balance_after, txn.emergency_amount);

  res.json({
    message: fromEmergency > 0 ? 'Payment successful (emergency fund used)' : 'Payment successful',
    transaction: txn,
    newBalance,
    emergencyBalance: newEmergencyBalance,
  });
});

// GET /wallet/menu-items — active canteen menu items for the cashier to pick from
router.get('/menu-items', authMiddleware, shopOwnerMiddleware, async (req, res) => {
  const items = await db.prepare(
    'SELECT id, name, category, price FROM menu_items WHERE active = 1 ORDER BY category, name'
  ).all();
  res.json(items);
});

// POST /wallet/pay-by-nfc — cashier terminal: uid + student PIN + amount (or menuItemId)
router.post('/pay-by-nfc', authMiddleware, shopOwnerMiddleware, async (req, res) => {
  let { uid, pin, amount, description, merchant, menuItemId } = req.body;

  // If a menu item is selected, resolve its server-trusted price/name up front.
  // This only fills in `amount`/`description` when the cashier omitted them —
  // the PIN, balance, and daily-limit checks below are untouched.
  let menuItem = null;
  if (menuItemId) {
    menuItem = await db.prepare('SELECT * FROM menu_items WHERE id = ? AND active = 1').get(menuItemId);
    if (!menuItem) return res.status(404).json({ error: 'Menu item not found or inactive' });
    if (amount === undefined || amount === null || amount === '') amount = menuItem.price;
    if (!description) description = menuItem.name;
  }

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

  if (card.daily_limit_count != null || card.daily_limit_amount != null) {
    const today = await db.prepare(`
      SELECT COUNT(*)::int AS count, COALESCE(SUM(amount), 0) AS total
      FROM transactions
      WHERE student_id = ? AND type = 'debit' AND created_at::date = CURRENT_DATE
    `).get(card.id);

    if (card.daily_limit_count != null && today.count >= card.daily_limit_count) {
      const parent = await getParentFor(card);
      return res.status(400).json({ error: 'Daily transaction limit reached', parentPhone: parent?.phone || null });
    }
    if (card.daily_limit_amount != null && (today.total + Number(amount)) > card.daily_limit_amount) {
      const parent = await getParentFor(card);
      return res.status(400).json({ error: 'Daily spending limit exceeded', parentPhone: parent?.phone || null });
    }
  }

  const totalAvailable = card.balance + (card.emergency_balance || 0);
  if (totalAvailable < amount) {
    const parent = await getParentFor(card);
    return res.status(400).json({ error: 'Insufficient balance', parentPhone: parent?.phone || null });
  }

  // Draw from the main balance first; any shortfall is auto-covered by the emergency fund.
  const fromMain = Math.min(card.balance, Number(amount));
  const fromEmergency = Number(amount) - fromMain;
  const newBalance = card.balance - fromMain;
  const newEmergencyBalance = (card.emergency_balance || 0) - fromEmergency;
  await db.prepare('UPDATE students SET balance = ?, emergency_balance = ? WHERE id = ?')
    .run(newBalance, newEmergencyBalance, card.id);

  const txn = {
    id:           uuidv4(),
    student_id:   card.id,
    type:         'debit',
    amount:       Number(amount),
    description:  description || 'Payment',
    merchant:     merchant || 'School',
    balance_after: newBalance,
    emergency_amount: fromEmergency,
    item_id:      menuItem ? menuItem.id : null,
    created_at:   new Date().toISOString().replace('T', ' ').slice(0, 19),
  };

  await db.prepare(`
    INSERT INTO transactions (id, student_id, type, amount, description, merchant, balance_after, emergency_amount, item_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(txn.id, txn.student_id, txn.type, txn.amount, txn.description, txn.merchant, txn.balance_after, txn.emergency_amount, txn.item_id);

  res.json({
    message: fromEmergency > 0 ? 'Payment successful (emergency fund used)' : 'Payment successful',
    transaction: txn,
    student: {
      name: card.name,
      class: card.class,
      newBalance,
      emergencyBalance: newEmergencyBalance,
      allergies: card.allergies || null,
    },
  });
});

module.exports = router;
