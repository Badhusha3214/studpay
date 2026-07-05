const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const { db } = require('../db/schema');
const { authMiddleware, parentMiddleware } = require('../middleware/auth');

function surnameOf(name) {
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1].toLowerCase();
}

function domainOf(email) {
  return email.split('@')[1]?.toLowerCase();
}

// Children linked to a parent by shared email domain + matching surname
async function getChildrenFor(parent) {
  const students = await db.prepare("SELECT * FROM students WHERE role = 'student'").all();
  return students.filter(
    (s) => domainOf(s.email) === domainOf(parent.email) && surnameOf(s.name) === surnameOf(parent.name)
  );
}

async function requireOwnChild(req, res, studentId) {
  const parent = await db.prepare('SELECT * FROM students WHERE id = ?').get(req.user.id);
  const children = await getChildrenFor(parent);
  if (!children.some((c) => c.id === studentId)) {
    res.status(403).json({ error: 'Not your child' });
    return null;
  }
  return children;
}

// GET /parent/children — list the caller's own children
router.get('/children', authMiddleware, parentMiddleware, async (req, res) => {
  const parent = await db.prepare('SELECT * FROM students WHERE id = ?').get(req.user.id);
  const childRows = await getChildrenFor(parent);
  const children = await Promise.all(childRows.map(async (s) => {
    const card = await db.prepare('SELECT uid, active, id FROM cards WHERE student_id = ? AND active = 1').get(s.id);
    return {
      id: s.id, name: s.name, email: s.email, class: s.class, balance: s.balance,
      card_uid: card?.uid ?? null, card_active: card?.active ?? null, card_id: card?.id ?? null,
    };
  }));
  res.json(children);
});

// GET /parent/child/:studentId — view child's wallet (must be caller's own child)
router.get('/child/:studentId', authMiddleware, parentMiddleware, async (req, res) => {
  if (!(await requireOwnChild(req, res, req.params.studentId))) return;

  const student = await db.prepare(`
    SELECT s.id, s.name, s.email, s.class, s.balance,
           c.uid AS card_uid, c.active AS card_active, c.id AS card_id
    FROM students s
    LEFT JOIN cards c ON c.student_id = s.id AND c.active = 1
    WHERE s.id = ?
  `).get(req.params.studentId);

  if (!student) return res.status(404).json({ error: 'Student not found' });

  const txns = await db.prepare(
    'SELECT * FROM transactions WHERE student_id = ? ORDER BY created_at DESC LIMIT 30'
  ).all(req.params.studentId);

  // Spending by category (description)
  const byCategory = await db.prepare(`
    SELECT description AS category, SUM(amount) AS total, COUNT(*)::int AS count
    FROM transactions WHERE student_id = ? AND type = 'debit'
    GROUP BY description ORDER BY total DESC
  `).all(req.params.studentId);

  // Spending by day (last 7 days)
  const byDay = await db.prepare(`
    SELECT created_at::date AS day, SUM(amount) AS total
    FROM transactions
    WHERE student_id = ? AND type = 'debit'
      AND created_at >= NOW() - INTERVAL '7 days'
    GROUP BY created_at::date
    ORDER BY day ASC
  `).all(req.params.studentId);

  res.json({ student, transactions: txns, byCategory, byDay });
});

// POST /parent/topup — parent tops up their own child's wallet
router.post('/topup', authMiddleware, parentMiddleware, async (req, res) => {
  const { studentId, amount, note } = req.body;
  if (!studentId || !amount || amount <= 0) {
    return res.status(400).json({ error: 'studentId and amount required' });
  }

  if (!(await requireOwnChild(req, res, studentId))) return;

  const student = await db.prepare('SELECT * FROM students WHERE id = ?').get(studentId);
  if (!student) return res.status(404).json({ error: 'Student not found' });

  const newBalance = student.balance + Number(amount);
  await db.prepare('UPDATE students SET balance = ? WHERE id = ?').run(newBalance, studentId);

  await db.prepare(`
    INSERT INTO transactions (id, student_id, type, amount, description, merchant, balance_after)
    VALUES (?, ?, 'credit', ?, ?, 'Parent Top-Up', ?)
  `).run(uuidv4(), studentId, Number(amount), note || 'Wallet Top-Up by Parent', newBalance);

  res.json({ message: 'Wallet topped up successfully', newBalance });
});

module.exports = router;
