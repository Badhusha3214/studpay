const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../db/schema');
const { authMiddleware, shopOwnerMiddleware } = require('../middleware/auth');

// GET /students — list all students with card info
router.get('/', authMiddleware, shopOwnerMiddleware, async (req, res) => {
  const students = await db.prepare(`
    SELECT s.id, s.name, s.email, s.class, s.balance, s.role, s.created_at,
           c.uid AS card_uid, c.active AS card_active, c.id AS card_id
    FROM students s
    LEFT JOIN cards c ON c.student_id = s.id AND c.active = 1
    WHERE s.role = 'student' AND s.active = 1
    ORDER BY s.name
  `).all();
  res.json(students);
});

// GET /students/:id — single student with full details + transactions
router.get('/:id', authMiddleware, async (req, res) => {
  const { id } = req.params;
  // Students can only view their own profile; shop owners can view any
  if (req.user.role !== 'shop_owner' && req.user.id !== id) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const student = await db.prepare(`
    SELECT s.id, s.name, s.email, s.class, s.balance, s.role, s.created_at,
           c.uid AS card_uid, c.active AS card_active, c.id AS card_id
    FROM students s
    LEFT JOIN cards c ON c.student_id = s.id AND c.active = 1
    WHERE s.id = ?
  `).get(id);

  if (!student) return res.status(404).json({ error: 'Student not found' });

  const txns = await db.prepare(
    'SELECT * FROM transactions WHERE student_id = ? ORDER BY created_at DESC LIMIT 50'
  ).all(id);

  const spending = await db.prepare(`
    SELECT description, SUM(amount) AS total
    FROM transactions WHERE student_id = ? AND type = 'debit'
    GROUP BY description ORDER BY total DESC LIMIT 5
  `).all(id);

  res.json({ ...student, transactions: txns, spendingBreakdown: spending });
});

// POST /students — create new student
router.post('/', authMiddleware, shopOwnerMiddleware, async (req, res) => {
  const { name, email, class: cls, pin, balance = 0 } = req.body;
  if (!name || !email || !cls || !pin) {
    return res.status(400).json({ error: 'name, email, class, pin are required' });
  }

  const existing = await db.prepare('SELECT id FROM students WHERE email = ?').get(email);
  if (existing) return res.status(409).json({ error: 'Email already registered' });

  const id      = 'stu-' + uuidv4().slice(0, 8);
  const pinHash = bcrypt.hashSync(String(pin), 10);

  await db.prepare(`
    INSERT INTO students (id, name, email, class, balance, pin_hash, role)
    VALUES (?, ?, ?, ?, ?, ?, 'student')
  `).run(id, name, email, cls, Number(balance), pinHash);

  res.status(201).json({ id, name, email, class: cls, balance: Number(balance) });
});

// PUT /students/:id — update student info
router.put('/:id', authMiddleware, shopOwnerMiddleware, async (req, res) => {
  const { name, email, class: cls } = req.body;
  await db.prepare(`
    UPDATE students SET name = COALESCE(?, name), email = COALESCE(?, email), class = COALESCE(?, class)
    WHERE id = ?
  `).run(name || null, email || null, cls || null, req.params.id);
  res.json({ message: 'Student updated' });
});

// DELETE /students/:id — archive student (soft delete: deactivate all cards + the account)
router.delete('/:id', authMiddleware, shopOwnerMiddleware, async (req, res) => {
  await db.prepare('UPDATE cards SET active = 0 WHERE student_id = ?').run(req.params.id);
  await db.prepare('UPDATE students SET active = 0 WHERE id = ?').run(req.params.id);
  res.json({ message: 'Student removed' });
});

// GET /students/:id/card-history — spending history for a specific card
router.get('/:id/card-history', authMiddleware, async (req, res) => {
  const { id } = req.params;
  if (req.user.role !== 'shop_owner' && req.user.id !== id) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const txns = await db.prepare(`
    SELECT t.*, c.uid AS card_uid
    FROM transactions t
    LEFT JOIN cards c ON c.student_id = t.student_id AND c.active = 1
    WHERE t.student_id = ?
    ORDER BY t.created_at DESC
  `).all(id);

  res.json(txns);
});

module.exports = router;
