import { Hono } from 'hono';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import { authMiddleware, parentMiddleware } from '../middleware/auth.js';
import { registerCard } from '../services/cards.js';
import { surnameOf, domainOf, getChildrenFor } from '../services/family.js';
import { parseAmount } from '../utils/validate.js';
import { HttpError } from '../utils/errors.js';

const app = new Hono();

function slugify(name) {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '.')
    .replace(/[^a-z0-9.]/g, '');
}

async function uniqueEmailFor(db, name, domain) {
  const base = slugify(name);
  let email = `${base}@${domain}`;
  let suffix = 1;
  while (await db.prepare('SELECT id FROM students WHERE email = ?').get(email)) {
    email = `${base}${suffix}@${domain}`;
    suffix++;
  }
  return email;
}

// Returns the caller's children if `studentId` is one of them, or null
// otherwise — callers respond with 403 themselves so this stays framework-agnostic.
// Exported so other routers (e.g. insights.js) can reuse the exact same
// parent-owns-this-child check instead of re-implementing it.
export async function requireOwnChild(db, user, studentId) {
  const parent = await db.prepare('SELECT * FROM students WHERE id = ?').get(user.id);
  const children = await getChildrenFor(db, parent);
  if (!children.some((ch) => ch.id === studentId)) return null;
  return children;
}

// GET /parent/children — list the caller's own children
app.get('/children', authMiddleware, parentMiddleware, async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const parent = await db.prepare('SELECT * FROM students WHERE id = ?').get(user.id);
  const childRows = await getChildrenFor(db, parent);
  const children = await Promise.all(
    childRows.map(async (s) => {
      const card = await db.prepare('SELECT uid, active, id FROM cards WHERE student_id = ? AND active = 1').get(s.id);
      return {
        id: s.id,
        name: s.name,
        email: s.email,
        class: s.class,
        balance: s.balance,
        emergency_balance: s.emergency_balance,
        allergies: s.allergies,
        card_uid: card?.uid ?? null,
        card_active: card?.active ?? null,
        card_id: card?.id ?? null,
        daily_limit_amount: s.daily_limit_amount,
        daily_limit_count: s.daily_limit_count,
      };
    })
  );
  return c.json(children);
});

// GET /parent/child/:studentId — view child's wallet (must be caller's own child)
app.get('/child/:studentId', authMiddleware, parentMiddleware, async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const studentId = c.req.param('studentId');
  if (!(await requireOwnChild(db, user, studentId))) return c.json({ error: 'Not your child' }, 403);

  const student = await db
    .prepare(
      `
    SELECT s.id, s.name, s.email, s.class, s.balance, s.emergency_balance, s.allergies,
           c.uid AS card_uid, c.active AS card_active, c.id AS card_id
    FROM students s
    LEFT JOIN cards c ON c.student_id = s.id AND c.active = 1
    WHERE s.id = ?
  `
    )
    .get(studentId);

  if (!student) return c.json({ error: 'Student not found' }, 404);

  const txns = await db
    .prepare('SELECT * FROM transactions WHERE student_id = ? ORDER BY created_at DESC LIMIT 30')
    .all(studentId);

  // Spending by category (description)
  const byCategory = await db
    .prepare(
      `
    SELECT description AS category, SUM(amount) AS total, COUNT(*)::int AS count
    FROM transactions WHERE student_id = ? AND type = 'debit'
    GROUP BY description ORDER BY total DESC
  `
    )
    .all(studentId);

  // Spending by day (last 7 days)
  const byDay = await db
    .prepare(
      `
    SELECT created_at::date AS day, SUM(amount) AS total
    FROM transactions
    WHERE student_id = ? AND type = 'debit'
      AND created_at >= NOW() - INTERVAL '7 days'
    GROUP BY created_at::date
    ORDER BY day ASC
  `
    )
    .all(studentId);

  return c.json({ student, transactions: txns, byCategory, byDay });
});

// POST /parent/topup — parent tops up their own child's wallet
app.post('/topup', authMiddleware, parentMiddleware, async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const body = await c.req.json();
  const { studentId, note } = body;
  const amount = parseAmount(body.amount);
  if (!studentId || amount === null) {
    return c.json({ error: 'studentId and amount required' }, 400);
  }

  if (!(await requireOwnChild(db, user, studentId))) return c.json({ error: 'Not your child' }, 403);

  try {
    const result = await db.withTransaction(async (trx) => {
      const student = await trx.prepare('SELECT * FROM students WHERE id = ? FOR UPDATE').get(studentId);
      if (!student) throw new HttpError(404, 'Student not found');

      const newBalance = student.balance + amount;
      await trx.prepare('UPDATE students SET balance = ? WHERE id = ?').run(newBalance, studentId);
      await trx
        .prepare(
          `
        INSERT INTO transactions (id, student_id, type, amount, description, merchant, balance_after)
        VALUES (?, ?, 'credit', ?, ?, 'Parent Top-Up', ?)
      `
        )
        .run(uuidv4(), studentId, amount, note || 'Wallet Top-Up by Parent', newBalance);

      return { message: 'Wallet topped up successfully', newBalance };
    });
    return c.json(result);
  } catch (err) {
    if (err instanceof HttpError) return c.json(err.body, err.status);
    throw err;
  }
});

// POST /parent/students — create a new child linked to the calling parent
app.post('/students', authMiddleware, parentMiddleware, async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const { name, class: cls, pin, balance = 0 } = await c.req.json();
  if (!name || !cls || !pin) {
    return c.json({ error: 'name, class, pin are required' }, 400);
  }

  const parent = await db.prepare('SELECT * FROM students WHERE id = ?').get(user.id);
  const parentSurname = surnameOf(parent.name);
  if (surnameOf(name) !== parentSurname) {
    const displaySurname = parent.name.trim().split(/\s+/).slice(-1)[0];
    return c.json(
      {
        error: `Child's last name must match yours (${displaySurname}) so the account links to you`,
      },
      400
    );
  }

  const email = await uniqueEmailFor(db, name, domainOf(parent.email));
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

// PUT /parent/child/:studentId — edit own child's name/class/daily limits/allergies
app.put('/child/:studentId', authMiddleware, parentMiddleware, async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const studentId = c.req.param('studentId');
  const { name, class: cls, dailyLimitAmount, dailyLimitCount, allergies } = await c.req.json();
  if (!(await requireOwnChild(db, user, studentId))) return c.json({ error: 'Not your child' }, 403);

  if (name) {
    const parent = await db.prepare('SELECT * FROM students WHERE id = ?').get(user.id);
    if (surnameOf(name) !== surnameOf(parent.name)) {
      const displaySurname = parent.name.trim().split(/\s+/).slice(-1)[0];
      return c.json(
        {
          error: `Last name must stay ${displaySurname} to keep this account linked to you`,
        },
        400
      );
    }
  }

  const current = await db
    .prepare('SELECT daily_limit_amount, daily_limit_count, allergies FROM students WHERE id = ?')
    .get(studentId);

  const toNullableNumber = (v) => (v === undefined ? undefined : v === null || v === '' ? null : Number(v));
  const toNullableString = (v) => (v === undefined ? undefined : v === null ? null : String(v).trim() || null);
  const newAmount = toNullableNumber(dailyLimitAmount);
  const newCount = toNullableNumber(dailyLimitCount);
  const newAllergies = toNullableString(allergies);

  await db
    .prepare(
      `
    UPDATE students SET
      name = COALESCE(?, name),
      class = COALESCE(?, class),
      daily_limit_amount = ?,
      daily_limit_count = ?,
      allergies = ?
    WHERE id = ?
  `
    )
    .run(
      name || null,
      cls || null,
      newAmount !== undefined ? newAmount : current.daily_limit_amount,
      newCount !== undefined ? newCount : current.daily_limit_count,
      newAllergies !== undefined ? newAllergies : current.allergies,
      studentId
    );

  return c.json({ message: 'Child updated' });
});

// POST /parent/child/:studentId/emergency-fund — deposit into own child's emergency fund.
// This balance is kept separate from the spendable wallet and is only drawn on
// automatically at payment time if the main balance runs short (see routes/wallet.js).
app.post('/child/:studentId/emergency-fund', authMiddleware, parentMiddleware, async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const studentId = c.req.param('studentId');
  const body = await c.req.json();
  const { note } = body;
  const amount = parseAmount(body.amount);
  if (amount === null) return c.json({ error: 'amount required' }, 400);
  if (!(await requireOwnChild(db, user, studentId))) return c.json({ error: 'Not your child' }, 403);

  try {
    const result = await db.withTransaction(async (trx) => {
      const student = await trx.prepare('SELECT * FROM students WHERE id = ? FOR UPDATE').get(studentId);
      if (!student) throw new HttpError(404, 'Student not found');

      const newEmergencyBalance = (student.emergency_balance || 0) + amount;
      await trx.prepare('UPDATE students SET emergency_balance = ? WHERE id = ?').run(newEmergencyBalance, studentId);

      await trx
        .prepare(
          `
        INSERT INTO transactions (id, student_id, type, amount, description, merchant, balance_after, emergency_amount)
        VALUES (?, ?, 'credit', ?, ?, 'Parent Emergency Fund', ?, ?)
      `
        )
        .run(uuidv4(), studentId, amount, note || 'Emergency Fund Deposit', student.balance, amount);

      return { message: 'Emergency fund topped up', emergencyBalance: newEmergencyBalance };
    });
    return c.json(result);
  } catch (err) {
    if (err instanceof HttpError) return c.json(err.body, err.status);
    throw err;
  }
});

// POST /parent/nfc/register — register an NFC card for the caller's own child
app.post('/nfc/register', authMiddleware, parentMiddleware, async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const { uid, studentId } = await c.req.json();
  if (!uid || !studentId) return c.json({ error: 'uid and studentId required' }, 400);
  if (!(await requireOwnChild(db, user, studentId))) return c.json({ error: 'Not your child' }, 403);

  const result = await registerCard(db, uid, studentId);
  if (result.error) return c.json(result, 409);

  return c.json({ message: `Card ${result.uid} linked`, cardId: result.cardId });
});

// PATCH /parent/child/:studentId/archive — archive (soft-delete) the caller's own child
app.patch('/child/:studentId/archive', authMiddleware, parentMiddleware, async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const studentId = c.req.param('studentId');
  if (!(await requireOwnChild(db, user, studentId))) return c.json({ error: 'Not your child' }, 403);

  await db.prepare('UPDATE cards SET active = 0 WHERE student_id = ?').run(studentId);
  await db.prepare('UPDATE students SET active = 0 WHERE id = ?').run(studentId);

  return c.json({ message: 'Child account archived' });
});

// PATCH /parent/nfc/:cardId/deactivate — deactivate one of the caller's own children's cards
app.patch('/nfc/:cardId/deactivate', authMiddleware, parentMiddleware, async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const cardId = c.req.param('cardId');
  const card = await db.prepare('SELECT * FROM cards WHERE id = ?').get(cardId);
  if (!card) return c.json({ error: 'Card not found' }, 404);
  if (!(await requireOwnChild(db, user, card.student_id))) return c.json({ error: 'Not your child' }, 403);

  await db.prepare('UPDATE cards SET active = 0 WHERE id = ?').run(cardId);
  return c.json({ message: 'Card deactivated' });
});

// PUT /parent/profile — update the caller's own contact phone number
app.put('/profile', authMiddleware, parentMiddleware, async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const { phone } = await c.req.json();
  await db.prepare('UPDATE students SET phone = ? WHERE id = ?').run(phone || null, user.id);
  return c.json({ phone: phone || null });
});

// GET /parent/pending-approvals — junk-food purchases by the caller's own
// young (grade <= 5) children that are still awaiting a reject/timeout
app.get('/pending-approvals', authMiddleware, parentMiddleware, async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const parent = await db.prepare('SELECT * FROM students WHERE id = ?').get(user.id);
  const children = await getChildrenFor(db, parent);
  const childIds = children.map((ch) => ch.id);
  if (childIds.length === 0) return c.json([]);

  const placeholders = childIds.map(() => '?').join(', ');
  const pending = await db
    .prepare(
      `
    SELECT p.id, p.student_id, p.amount, p.description, p.expires_at, s.name AS student_name
    FROM pending_purchases p
    JOIN students s ON s.id = p.student_id
    WHERE p.student_id IN (${placeholders}) AND p.status = 'pending'
    ORDER BY p.created_at ASC
  `
    )
    .all(...childIds);

  return c.json(
    pending.map((p) => ({
      id: p.id,
      studentId: p.student_id,
      studentName: p.student_name,
      amount: p.amount,
      description: p.description,
      expiresAt: p.expires_at,
    }))
  );
});

// POST /parent/pending-approvals/:id/reject — reject a held purchase for the
// caller's own child. If nobody rejects it before the timeout, the cashier's
// poll on GET /wallet/pending/:id auto-approves it instead (see routes/wallet.js).
app.post('/pending-approvals/:id/reject', authMiddleware, parentMiddleware, async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const id = c.req.param('id');
  const pending = await db.prepare('SELECT * FROM pending_purchases WHERE id = ?').get(id);
  if (!pending) return c.json({ error: 'Pending purchase not found' }, 404);
  if (!(await requireOwnChild(db, user, pending.student_id))) return c.json({ error: 'Not your child' }, 403);

  const rejected = await db
    .prepare(
      "UPDATE pending_purchases SET status = 'rejected', resolved_at = NOW() WHERE id = ? AND status = 'pending' RETURNING id"
    )
    .get(id);
  if (!rejected) return c.json({ error: 'This purchase was already resolved' }, 409);

  await db.prepare("UPDATE orders SET status = 'rejected' WHERE pending_purchase_id = ?").run(id);

  return c.json({ message: 'Purchase rejected' });
});

export default app;
