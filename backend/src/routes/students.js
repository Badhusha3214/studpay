const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../db/schema');
const { authMiddleware, shopOwnerMiddleware, staffMiddleware } = require('../middleware/auth');
const { logAction } = require('../services/auditLog');

const STAFF_ROLES = ['shop_owner', 'school_admin'];

// GET /students — list all students with card info. Optional filters:
// ?q= (name/email search), ?class= (exact match), ?active=all (default
// active-only, preserving the cashier dashboard's existing no-params call).
router.get('/', authMiddleware, staffMiddleware, async (req, res) => {
  const { q, class: cls, active } = req.query;

  const conditions = ["s.role = 'student'"];
  const params = [];

  if (active !== 'all') conditions.push('s.active = 1');
  if (cls) { conditions.push('s.class = ?'); params.push(cls); }
  if (q) { conditions.push('(s.name ILIKE ? OR s.email ILIKE ?)'); params.push(`%${q}%`, `%${q}%`); }

  const students = await db.prepare(`
    SELECT s.id, s.name, s.email, s.class, s.balance, s.role, s.active, s.created_at,
           c.uid AS card_uid, c.active AS card_active, c.id AS card_id
    FROM students s
    LEFT JOIN cards c ON c.student_id = s.id AND c.active = 1
    WHERE ${conditions.join(' AND ')}
    ORDER BY s.name
  `).all(...params);
  res.json(students);
});

// GET /students/:id — single student with full details + transactions
router.get('/:id', authMiddleware, async (req, res) => {
  const { id } = req.params;
  // Students can only view their own profile; staff (shop owners, school admins) can view any
  if (!STAFF_ROLES.includes(req.user.role) && req.user.id !== id) {
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

// DELETE /students/:id — archive student (soft delete: deactivate all cards + the account).
// No role filter on the target row — this also serves as "deactivate a staff
// account" for the school-admin staff view (see routes/admin.js). Guarded
// below so a shop_owner (staffMiddleware allows them here for deactivating
// students) can't use this to deactivate another shop_owner or a
// school_admin — only a school_admin may target a staff row.
router.delete('/:id', authMiddleware, staffMiddleware, async (req, res) => {
  const target = await db.prepare('SELECT role FROM students WHERE id = ?').get(req.params.id);
  if (!target) return res.status(404).json({ error: 'Student not found' });
  if (['shop_owner', 'school_admin'].includes(target.role) && req.user.role !== 'school_admin') {
    return res.status(403).json({ error: 'Only a school admin can deactivate a staff account' });
  }

  await db.prepare('UPDATE cards SET active = 0 WHERE student_id = ?').run(req.params.id);
  await db.prepare('UPDATE students SET active = 0 WHERE id = ?').run(req.params.id);

  await logAction(db, {
    actorId: req.user.id, actorRole: req.user.role, action: 'account_deactivated',
    entity: target.role === 'student' ? 'students' : 'staff', entityId: req.params.id,
    before: { active: 1 }, after: { active: 0 },
  });

  res.json({ message: 'Student removed' });
});

// GET /students/:id/card-history — spending history for a specific card
router.get('/:id/card-history', authMiddleware, async (req, res) => {
  const { id } = req.params;
  if (!STAFF_ROLES.includes(req.user.role) && req.user.id !== id) {
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
