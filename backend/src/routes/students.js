import { Hono } from 'hono';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { authMiddleware, shopOwnerMiddleware, staffMiddleware, getSchoolId } from '../middleware/auth.js';
import { logAction } from '../services/auditLog.js';

const app = new Hono();

const STAFF_ROLES = ['shop_owner', 'school_admin'];

// GET /students — list all students with card info. Optional filters:
// ?q= (name/email search), ?class= (exact match), ?active=all (default
// active-only, preserving the cashier dashboard's existing no-params call).
app.get('/', authMiddleware, staffMiddleware, async (c) => {
  const db = c.get('db');
  const schoolId = getSchoolId(c);
  const q = c.req.query('q');
  const cls = c.req.query('class');
  const active = c.req.query('active');

  const conditions = ["s.role = 'student'"];
  const params = [];

  if (schoolId) {
    conditions.push('s.school_id = ?');
    params.push(schoolId);
  }
  if (active !== 'all') conditions.push('s.active = 1');
  if (cls) {
    conditions.push('s.class = ?');
    params.push(cls);
  }
  if (q) {
    conditions.push('(s.name ILIKE ? OR s.email ILIKE ?)');
    params.push(`%${q}%`, `%${q}%`);
  }

  const students = await db
    .prepare(
      `
    SELECT s.id, s.name, s.email, s.class, s.balance, s.role, s.active, s.created_at,
           c.uid AS card_uid, c.active AS card_active, c.id AS card_id
    FROM students s
    LEFT JOIN cards c ON c.student_id = s.id AND c.active = 1
    WHERE ${conditions.join(' AND ')}
    ORDER BY s.name
  `
    )
    .all(...params);
  return c.json(students);
});

// GET /students/:id — single student with full details + transactions
app.get('/:id', authMiddleware, async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const id = c.req.param('id');
  // Students can only view their own profile; staff (shop owners, school admins) can view any
  if (!STAFF_ROLES.includes(user.role) && user.id !== id) {
    return c.json({ error: 'Access denied' }, 403);
  }

  const student = await db
    .prepare(
      `
    SELECT s.id, s.name, s.email, s.class, s.balance, s.role, s.created_at,
           c.uid AS card_uid, c.active AS card_active, c.id AS card_id
    FROM students s
    LEFT JOIN cards c ON c.student_id = s.id AND c.active = 1
    WHERE s.id = ?
  `
    )
    .get(id);

  if (!student) return c.json({ error: 'Student not found' }, 404);

  const txns = await db
    .prepare('SELECT * FROM transactions WHERE student_id = ? ORDER BY created_at DESC LIMIT 50')
    .all(id);

  const spending = await db
    .prepare(
      `
    SELECT description, SUM(amount) AS total
    FROM transactions WHERE student_id = ? AND type = 'debit'
    GROUP BY description ORDER BY total DESC LIMIT 5
  `
    )
    .all(id);

  return c.json({ ...student, transactions: txns, spendingBreakdown: spending });
});

// POST /students — create new student
app.post('/', authMiddleware, shopOwnerMiddleware, async (c) => {
  const db = c.get('db');
  const { name, email, class: cls, pin, balance = 0 } = await c.req.json();
  if (!name || !email || !cls || !pin) {
    return c.json({ error: 'name, email, class, pin are required' }, 400);
  }

  const existing = await db.prepare('SELECT id FROM students WHERE email = ?').get(email);
  if (existing) return c.json({ error: 'Email already registered' }, 409);

  const id = 'stu-' + uuidv4().slice(0, 8);
  const pinHash = bcrypt.hashSync(String(pin), 10);

  await db
    .prepare(
      `
    INSERT INTO students (id, name, email, class, balance, pin_hash, role)
    VALUES (?, ?, ?, ?, ?, ?, 'student')
  `
    )
    .run(id, name, email, cls, Number(balance), pinHash);

  return c.json({ id, name, email, class: cls, balance: Number(balance) }, 201);
});

// PUT /students/:id — update student info
app.put('/:id', authMiddleware, shopOwnerMiddleware, async (c) => {
  const db = c.get('db');
  const id = c.req.param('id');
  const { name, email, class: cls } = await c.req.json();
  await db
    .prepare(
      `
    UPDATE students SET name = COALESCE(?, name), email = COALESCE(?, email), class = COALESCE(?, class)
    WHERE id = ?
  `
    )
    .run(name || null, email || null, cls || null, id);
  return c.json({ message: 'Student updated' });
});

// DELETE /students/:id — archive student (soft delete: deactivate all cards + the account).
// No role filter on the target row — this also serves as "deactivate a staff
// account" for the school-admin staff view (see routes/admin.js). Guarded
// below so a shop_owner (staffMiddleware allows them here for deactivating
// students) can't use this to deactivate another shop_owner or a
// school_admin — only a school_admin may target a staff row.
app.delete('/:id', authMiddleware, staffMiddleware, async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const id = c.req.param('id');
  const target = await db.prepare('SELECT role FROM students WHERE id = ?').get(id);
  if (!target) return c.json({ error: 'Student not found' }, 404);
  if (['shop_owner', 'school_admin'].includes(target.role) && user.role !== 'school_admin') {
    return c.json({ error: 'Only a school admin can deactivate a staff account' }, 403);
  }

  await db.prepare('UPDATE cards SET active = 0 WHERE student_id = ?').run(id);
  await db.prepare('UPDATE students SET active = 0 WHERE id = ?').run(id);

  await logAction(db, {
    actorId: user.id,
    actorRole: user.role,
    action: 'account_deactivated',
    entity: target.role === 'student' ? 'students' : 'staff',
    entityId: id,
    before: { active: 1 },
    after: { active: 0 },
  });

  return c.json({ message: 'Student removed' });
});

// GET /students/:id/card-history — spending history for a specific card
app.get('/:id/card-history', authMiddleware, async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const id = c.req.param('id');
  if (!STAFF_ROLES.includes(user.role) && user.id !== id) {
    return c.json({ error: 'Access denied' }, 403);
  }

  const txns = await db
    .prepare(
      `
    SELECT t.*, c.uid AS card_uid
    FROM transactions t
    LEFT JOIN cards c ON c.student_id = t.student_id AND c.active = 1
    WHERE t.student_id = ?
    ORDER BY t.created_at DESC
  `
    )
    .all(id);

  return c.json(txns);
});

export default app;
