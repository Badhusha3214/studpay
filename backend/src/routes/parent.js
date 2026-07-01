const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const { db } = require('../db/schema');
const { authMiddleware } = require('../middleware/auth');

// GET /parent/child/:studentId — view child's wallet (parent uses admin token for now)
router.get('/child/:studentId', authMiddleware, (req, res) => {
  const student = db.prepare(`
    SELECT s.id, s.name, s.email, s.class, s.balance,
           c.uid AS card_uid, c.active AS card_active, c.id AS card_id
    FROM students s
    LEFT JOIN cards c ON c.student_id = s.id AND c.active = 1
    WHERE s.id = ?
  `).get(req.params.studentId);

  if (!student) return res.status(404).json({ error: 'Student not found' });

  const txns = db.prepare(
    'SELECT * FROM transactions WHERE student_id = ? ORDER BY created_at DESC LIMIT 30'
  ).all(req.params.studentId);

  // Spending by category (description)
  const byCategory = db.prepare(`
    SELECT description AS category, SUM(amount) AS total, COUNT(*) AS count
    FROM transactions WHERE student_id = ? AND type = 'debit'
    GROUP BY description ORDER BY total DESC
  `).all(req.params.studentId);

  // Spending by day (last 7 days)
  const byDay = db.prepare(`
    SELECT date(created_at) AS day, SUM(amount) AS total
    FROM transactions
    WHERE student_id = ? AND type = 'debit'
      AND created_at >= datetime('now', '-7 days')
    GROUP BY date(created_at)
    ORDER BY day ASC
  `).all(req.params.studentId);

  res.json({ student, transactions: txns, byCategory, byDay });
});

// POST /parent/topup — parent tops up child wallet
router.post('/topup', authMiddleware, (req, res) => {
  const { studentId, amount, note } = req.body;
  if (!studentId || !amount || amount <= 0) {
    return res.status(400).json({ error: 'studentId and amount required' });
  }

  const student = db.prepare('SELECT * FROM students WHERE id = ?').get(studentId);
  if (!student) return res.status(404).json({ error: 'Student not found' });

  const newBalance = student.balance + Number(amount);
  db.prepare('UPDATE students SET balance = ? WHERE id = ?').run(newBalance, studentId);

  db.prepare(`
    INSERT INTO transactions (id, student_id, type, amount, description, merchant, balance_after)
    VALUES (?, ?, 'credit', ?, ?, 'Parent Top-Up', ?)
  `).run(uuidv4(), studentId, Number(amount), note || 'Wallet Top-Up by Parent', newBalance);

  res.json({ message: 'Wallet topped up successfully', newBalance });
});

module.exports = router;
