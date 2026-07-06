const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const { db } = require('../db/schema');
const { authMiddleware, parentMiddleware } = require('../middleware/auth');
const { registerCard } = require('../services/cards');
const { surnameOf, domainOf, getChildrenFor } = require('../services/family');

function slugify(name) {
  return name.trim().toLowerCase().replace(/\s+/g, '.').replace(/[^a-z0-9.]/g, '');
}

async function uniqueEmailFor(name, domain) {
  const base = slugify(name);
  let email = `${base}@${domain}`;
  let suffix = 1;
  while (await db.prepare('SELECT id FROM students WHERE email = ?').get(email)) {
    email = `${base}${suffix}@${domain}`;
    suffix++;
  }
  return email;
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
      emergency_balance: s.emergency_balance, allergies: s.allergies,
      card_uid: card?.uid ?? null, card_active: card?.active ?? null, card_id: card?.id ?? null,
      daily_limit_amount: s.daily_limit_amount, daily_limit_count: s.daily_limit_count,
    };
  }));
  res.json(children);
});

// GET /parent/child/:studentId — view child's wallet (must be caller's own child)
router.get('/child/:studentId', authMiddleware, parentMiddleware, async (req, res) => {
  if (!(await requireOwnChild(req, res, req.params.studentId))) return;

  const student = await db.prepare(`
    SELECT s.id, s.name, s.email, s.class, s.balance, s.emergency_balance, s.allergies,
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

// POST /parent/students — create a new child linked to the calling parent
router.post('/students', authMiddleware, parentMiddleware, async (req, res) => {
  const { name, class: cls, pin, balance = 0 } = req.body;
  if (!name || !cls || !pin) {
    return res.status(400).json({ error: 'name, class, pin are required' });
  }

  const parent = await db.prepare('SELECT * FROM students WHERE id = ?').get(req.user.id);
  const parentSurname = surnameOf(parent.name);
  if (surnameOf(name) !== parentSurname) {
    const displaySurname = parent.name.trim().split(/\s+/).slice(-1)[0];
    return res.status(400).json({
      error: `Child's last name must match yours (${displaySurname}) so the account links to you`,
    });
  }

  const email   = await uniqueEmailFor(name, domainOf(parent.email));
  const id      = 'stu-' + uuidv4().slice(0, 8);
  const pinHash = bcrypt.hashSync(String(pin), 10);

  await db.prepare(`
    INSERT INTO students (id, name, email, class, balance, pin_hash, role)
    VALUES (?, ?, ?, ?, ?, ?, 'student')
  `).run(id, name, email, cls, Number(balance), pinHash);

  res.status(201).json({ id, name, email, class: cls, balance: Number(balance) });
});

// PUT /parent/child/:studentId — edit own child's name/class/daily limits/allergies
router.put('/child/:studentId', authMiddleware, parentMiddleware, async (req, res) => {
  const { name, class: cls, dailyLimitAmount, dailyLimitCount, allergies } = req.body;
  if (!(await requireOwnChild(req, res, req.params.studentId))) return;

  if (name) {
    const parent = await db.prepare('SELECT * FROM students WHERE id = ?').get(req.user.id);
    if (surnameOf(name) !== surnameOf(parent.name)) {
      const displaySurname = parent.name.trim().split(/\s+/).slice(-1)[0];
      return res.status(400).json({
        error: `Last name must stay ${displaySurname} to keep this account linked to you`,
      });
    }
  }

  const current = await db.prepare(
    'SELECT daily_limit_amount, daily_limit_count, allergies FROM students WHERE id = ?'
  ).get(req.params.studentId);

  const toNullableNumber = (v) => (v === undefined ? undefined : (v === null || v === '' ? null : Number(v)));
  const toNullableString = (v) => (v === undefined ? undefined : (v === null ? null : String(v).trim() || null));
  const newAmount    = toNullableNumber(dailyLimitAmount);
  const newCount     = toNullableNumber(dailyLimitCount);
  const newAllergies = toNullableString(allergies);

  await db.prepare(`
    UPDATE students SET
      name = COALESCE(?, name),
      class = COALESCE(?, class),
      daily_limit_amount = ?,
      daily_limit_count = ?,
      allergies = ?
    WHERE id = ?
  `).run(
    name || null, cls || null,
    newAmount !== undefined ? newAmount : current.daily_limit_amount,
    newCount !== undefined ? newCount : current.daily_limit_count,
    newAllergies !== undefined ? newAllergies : current.allergies,
    req.params.studentId
  );

  res.json({ message: 'Child updated' });
});

// POST /parent/child/:studentId/emergency-fund — deposit into own child's emergency fund.
// This balance is kept separate from the spendable wallet and is only drawn on
// automatically at payment time if the main balance runs short (see wallet.js).
router.post('/child/:studentId/emergency-fund', authMiddleware, parentMiddleware, async (req, res) => {
  const { amount, note } = req.body;
  if (!amount || amount <= 0) return res.status(400).json({ error: 'amount required' });
  if (!(await requireOwnChild(req, res, req.params.studentId))) return;

  const student = await db.prepare('SELECT * FROM students WHERE id = ?').get(req.params.studentId);
  if (!student) return res.status(404).json({ error: 'Student not found' });

  const newEmergencyBalance = (student.emergency_balance || 0) + Number(amount);
  await db.prepare('UPDATE students SET emergency_balance = ? WHERE id = ?')
    .run(newEmergencyBalance, req.params.studentId);

  await db.prepare(`
    INSERT INTO transactions (id, student_id, type, amount, description, merchant, balance_after, emergency_amount)
    VALUES (?, ?, 'credit', ?, ?, 'Parent Emergency Fund', ?, ?)
  `).run(
    uuidv4(), req.params.studentId, Number(amount), note || 'Emergency Fund Deposit',
    student.balance, Number(amount)
  );

  res.json({ message: 'Emergency fund topped up', emergencyBalance: newEmergencyBalance });
});

// POST /parent/nfc/register — register an NFC card for the caller's own child
router.post('/nfc/register', authMiddleware, parentMiddleware, async (req, res) => {
  const { uid, studentId } = req.body;
  if (!uid || !studentId) return res.status(400).json({ error: 'uid and studentId required' });
  if (!(await requireOwnChild(req, res, studentId))) return;

  const result = await registerCard(uid, studentId);
  if (result.error) return res.status(409).json(result);

  res.json({ message: `Card ${result.uid} linked`, cardId: result.cardId });
});

// PATCH /parent/child/:studentId/archive — archive (soft-delete) the caller's own child
router.patch('/child/:studentId/archive', authMiddleware, parentMiddleware, async (req, res) => {
  if (!(await requireOwnChild(req, res, req.params.studentId))) return;

  await db.prepare('UPDATE cards SET active = 0 WHERE student_id = ?').run(req.params.studentId);
  await db.prepare('UPDATE students SET active = 0 WHERE id = ?').run(req.params.studentId);

  res.json({ message: 'Child account archived' });
});

// PATCH /parent/nfc/:cardId/deactivate — deactivate one of the caller's own children's cards
router.patch('/nfc/:cardId/deactivate', authMiddleware, parentMiddleware, async (req, res) => {
  const card = await db.prepare('SELECT * FROM cards WHERE id = ?').get(req.params.cardId);
  if (!card) return res.status(404).json({ error: 'Card not found' });
  if (!(await requireOwnChild(req, res, card.student_id))) return;

  await db.prepare('UPDATE cards SET active = 0 WHERE id = ?').run(req.params.cardId);
  res.json({ message: 'Card deactivated' });
});

// PUT /parent/profile — update the caller's own contact phone number
router.put('/profile', authMiddleware, parentMiddleware, async (req, res) => {
  const { phone } = req.body;
  await db.prepare('UPDATE students SET phone = ? WHERE id = ?').run(phone || null, req.user.id);
  res.json({ phone: phone || null });
});

module.exports = router;
