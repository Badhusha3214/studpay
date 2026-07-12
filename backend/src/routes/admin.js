const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { db, withTransaction } = require('../db/schema');
const { authMiddleware, schoolAdminMiddleware } = require('../middleware/auth');
const { createShopOwnerAccount, assertEmailFree } = require('../services/accounts');
const { recordSuccess } = require('../services/pinAuth');
const { logAction } = require('../services/auditLog');
const { getParentFor } = require('../services/family');
const { EMAIL_RE, PIN_RE, MAX_BULK_ROWS, parseBalance } = require('../utils/validate');
const { csvEscape } = require('../utils/csv');
const { HttpError } = require('../utils/errors');

const PENDING_APPROVAL_STATUSES = ['pending', 'approved', 'rejected'];
const REFUND_QUEUE_STATUSES = ['refund_pending', 'refunded'];

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function currentMonth() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

function randomPin() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

// POST /admin/students/bulk — roster import. Rows are processed sequentially
// against the module-level `db` (not withTransaction) so one bad row can't
// roll back the good rows around it, and so each row's uniqueness check
// sees prior rows' just-inserted emails (catches intra-batch duplicates too).
router.post('/students/bulk', authMiddleware, schoolAdminMiddleware, async (req, res) => {
  const { students } = req.body;
  if (!Array.isArray(students) || students.length === 0) {
    return res.status(400).json({ error: 'students must be a non-empty array' });
  }
  if (students.length > MAX_BULK_ROWS) {
    return res.status(400).json({ error: `Cannot import more than ${MAX_BULK_ROWS} students at once` });
  }

  const results = [];
  let succeeded = 0;

  for (let i = 0; i < students.length; i++) {
    const row = students[i] || {};
    const { name, email, class: cls, pin } = row;
    const rowNum = i + 1;

    try {
      if (!name || !email || !cls || !pin) {
        throw new HttpError(400, 'name, email, class and pin are required');
      }
      if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Enter a valid email address');
      if (!PIN_RE.test(String(pin))) throw new HttpError(400, 'PIN must be 4-6 digits');
      const balance = parseBalance(row.balance);
      if (balance === null) throw new HttpError(400, 'Invalid balance');

      await assertEmailFree(email);

      const id      = 'stu-' + uuidv4().slice(0, 8);
      const pinHash = bcrypt.hashSync(String(pin), 10);

      await db.prepare(`
        INSERT INTO students (id, name, email, class, balance, pin_hash, role)
        VALUES (?, ?, ?, ?, ?, ?, 'student')
      `).run(id, name, email, cls, balance, pinHash);

      succeeded += 1;
      results.push({ row: rowNum, status: 'success', id, email });
    } catch (err) {
      const message = err instanceof HttpError ? err.body.error : 'Unexpected error';
      results.push({ row: rowNum, status: 'error', email: email || null, error: message });
    }
  }

  res.json({
    summary: { total: students.length, succeeded, failed: students.length - succeeded },
    results,
  });
});

// GET /admin/staff?role=shop_owner|school_admin — list staff accounts
router.get('/staff', authMiddleware, schoolAdminMiddleware, async (req, res) => {
  const { role } = req.query;
  const roles = role && ['shop_owner', 'school_admin'].includes(role) ? [role] : ['shop_owner', 'school_admin'];
  const placeholders = roles.map(() => '?').join(', ');

  const staff = await db.prepare(`
    SELECT id, name, email, merchant_name, phone, role, active, created_at
    FROM students
    WHERE role IN (${placeholders})
    ORDER BY role, name
  `).all(...roles);

  res.json(staff);
});

// POST /admin/shop-owners — provision a cashier account directly (bypasses self-registration)
router.post('/shop-owners', authMiddleware, schoolAdminMiddleware, async (req, res) => {
  const { name, email, pin, merchantName, phone, shopId } = req.body;
  try {
    const student = await createShopOwnerAccount({ name, email, pin, merchantName, phone, shopId });
    await logAction(db, {
      actorId: req.user.id, actorRole: 'school_admin', action: 'cashier_created',
      entity: 'students', entityId: student.id, after: { merchant_name: student.merchant_name, shop_id: student.shop_id },
    });
    res.status(201).json(student);
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json(err.body);
    throw err;
  }
});

// POST /admin/school-admins — provision another school-admin account
router.post('/school-admins', authMiddleware, schoolAdminMiddleware, async (req, res) => {
  const { name, email, pin } = req.body;

  try {
    if (!name || !email || !pin) throw new HttpError(400, 'name, email and pin are required');
    if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Enter a valid email address');
    if (!PIN_RE.test(String(pin))) throw new HttpError(400, 'PIN must be 4-6 digits');
    await assertEmailFree(email);

    const id      = 'schooladmin-' + uuidv4().slice(0, 8);
    const pinHash = bcrypt.hashSync(String(pin), 10);

    await db.prepare(`
      INSERT INTO students (id, name, email, class, balance, pin_hash, role)
      VALUES (?, ?, ?, 'Admin', 0, ?, 'school_admin')
    `).run(id, name, email, pinHash);

    res.status(201).json({ id, name, email, class: 'Admin', balance: 0, role: 'school_admin' });
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json(err.body);
    throw err;
  }
});

// PATCH /admin/students/:id/reactivate — role-agnostic (undoes DELETE
// /students/:id for a student, shop_owner, or school_admin row alike, since
// that endpoint has no target-role filter beyond the staff-vs-staff guard).
router.patch('/students/:id/reactivate', authMiddleware, schoolAdminMiddleware, async (req, res) => {
  const row = await db.prepare('UPDATE students SET active = 1 WHERE id = ? RETURNING id, role').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });

  await logAction(db, {
    actorId: req.user.id, actorRole: 'school_admin', action: 'account_reactivated',
    entity: row.role === 'student' ? 'students' : 'staff', entityId: req.params.id,
    before: { active: 0 }, after: { active: 1 },
  });

  res.json({ message: 'Account reactivated' });
});

// POST /admin/students/:id/reset-pin — { pin? } or auto-generates one.
// Returns the plaintext PIN once (unrecoverable after hashing) and clears
// any brute-force lockout state via the same recordSuccess() used on login.
router.post('/students/:id/reset-pin', authMiddleware, schoolAdminMiddleware, async (req, res) => {
  const { id } = req.params;
  let { pin } = req.body;

  if (pin !== undefined && pin !== null && pin !== '') {
    if (!PIN_RE.test(String(pin))) return res.status(400).json({ error: 'PIN must be 4-6 digits' });
  } else {
    pin = randomPin();
  }

  const student = await db.prepare('SELECT id FROM students WHERE id = ?').get(id);
  if (!student) return res.status(404).json({ error: 'Not found' });

  const pinHash = bcrypt.hashSync(String(pin), 10);
  await db.prepare('UPDATE students SET pin_hash = ? WHERE id = ?').run(pinHash, id);
  await recordSuccess(db, id);

  await logAction(db, {
    actorId: req.user.id, actorRole: 'school_admin', action: 'pin_reset',
    entity: 'students', entityId: id,
  });

  res.json({ message: 'PIN reset', pin: String(pin) });
});

// GET /admin/analytics/overview?month=YYYY-MM — school-wide purchase analytics
router.get('/analytics/overview', authMiddleware, schoolAdminMiddleware, async (req, res) => {
  const month = MONTH_RE.test(req.query.month || '') ? req.query.month : currentMonth();
  const [year, mon] = month.split('-').map(Number);
  const start = new Date(Date.UTC(year, mon - 1, 1)).toISOString();
  const end   = new Date(Date.UTC(year, mon, 1)).toISOString();

  const rows = await db.prepare(`
    SELECT t.amount, t.created_at::date::text AS day, s.id AS student_id, s.name AS student_name, s.class,
           m.category AS category
    FROM transactions t
    JOIN students s ON s.id = t.student_id
    LEFT JOIN menu_items m ON m.id = t.item_id
    WHERE t.type = 'debit' AND t.created_at >= ? AND t.created_at < ?
  `).all(start, end);

  let totalRevenue = 0;
  const byClass = {};
  const byCategory = {};
  const byDay = {};
  const bySpender = {};

  for (const r of rows) {
    const amt = Number(r.amount);
    totalRevenue += amt;

    if (!byClass[r.class]) byClass[r.class] = { class: r.class, count: 0, total: 0 };
    byClass[r.class].count += 1;
    byClass[r.class].total += amt;

    const cat = r.category || 'uncategorized';
    if (!byCategory[cat]) byCategory[cat] = { category: cat, count: 0, total: 0 };
    byCategory[cat].count += 1;
    byCategory[cat].total += amt;

    const day = r.day;
    if (!byDay[day]) byDay[day] = { day, total: 0 };
    byDay[day].total += amt;

    if (!bySpender[r.student_id]) bySpender[r.student_id] = { studentId: r.student_id, name: r.student_name, total: 0 };
    bySpender[r.student_id].total += amt;
  }

  const round2 = (v) => Number(v.toFixed(2));
  const sortByTotalDesc = (a, b) => b.total - a.total;

  res.json({
    month,
    totals: { revenue: round2(totalRevenue), transactionCount: rows.length },
    byClass: Object.values(byClass).map((v) => ({ ...v, total: round2(v.total) })).sort(sortByTotalDesc),
    byCategory: Object.values(byCategory).map((v) => ({ ...v, total: round2(v.total) })).sort(sortByTotalDesc),
    byDay: Object.values(byDay).map((v) => ({ ...v, total: round2(v.total) })).sort((a, b) => a.day.localeCompare(b.day)),
    topSpenders: Object.values(bySpender).map((v) => ({ ...v, total: round2(v.total) })).sort(sortByTotalDesc).slice(0, 10),
  });
});

// GET /admin/dashboard — school-wide summary stats
router.get('/dashboard', authMiddleware, schoolAdminMiddleware, async (req, res) => {
  const wallet = await db.prepare(`
    SELECT COALESCE(SUM(balance), 0) AS total_balance, COALESCE(SUM(emergency_balance), 0) AS total_emergency
    FROM students WHERE role = 'student' AND active = 1
  `).get();

  const todayTxns = await db.prepare(`
    SELECT COUNT(*)::int AS count, COALESCE(SUM(amount), 0) AS amount
    FROM transactions WHERE type = 'debit' AND created_at::date = CURRENT_DATE
  `).get();

  const cards = await db.prepare(`
    SELECT COUNT(*) FILTER (WHERE active = 1)::int AS active_count,
           COUNT(*) FILTER (WHERE active = 0)::int AS inactive_count
    FROM cards
  `).get();

  const pendingApprovals = await db.prepare(
    "SELECT COUNT(*)::int AS count FROM pending_purchases WHERE status = 'pending'"
  ).get();

  res.json({
    totalWalletBalance: Number(wallet.total_balance),
    totalEmergencyBalance: Number(wallet.total_emergency),
    todayTransactionCount: todayTxns.count,
    todayTransactionAmount: Number(todayTxns.amount),
    activeCards: cards.active_count,
    inactiveCards: cards.inactive_count,
    pendingApprovals: pendingApprovals.count,
  });
});

// POST /admin/students — single-student add (bulk import handles the roster case)
router.post('/students', authMiddleware, schoolAdminMiddleware, async (req, res) => {
  const { name, email, class: cls, pin, balance, dailyLimitAmount, dailyLimitCount, allergies, phone } = req.body;

  try {
    if (!name || !email || !cls || !pin) throw new HttpError(400, 'name, email, class and pin are required');
    if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Enter a valid email address');
    if (!PIN_RE.test(String(pin))) throw new HttpError(400, 'PIN must be 4-6 digits');
    const bal = parseBalance(balance);
    if (bal === null) throw new HttpError(400, 'Invalid balance');
    await assertEmailFree(email);

    const id      = 'stu-' + uuidv4().slice(0, 8);
    const pinHash = bcrypt.hashSync(String(pin), 10);
    const dailyAmt = dailyLimitAmount === undefined || dailyLimitAmount === null || dailyLimitAmount === '' ? null : Number(dailyLimitAmount);
    const dailyCnt = dailyLimitCount === undefined || dailyLimitCount === null || dailyLimitCount === '' ? null : Number(dailyLimitCount);

    await db.prepare(`
      INSERT INTO students (id, name, email, class, balance, pin_hash, role, daily_limit_amount, daily_limit_count, allergies, phone)
      VALUES (?, ?, ?, ?, ?, ?, 'student', ?, ?, ?, ?)
    `).run(id, name, email, cls, bal, pinHash, dailyAmt, dailyCnt, allergies || null, phone || null);

    res.status(201).json({ id, name, email, class: cls, balance: bal });
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json(err.body);
    throw err;
  }
});

// PATCH /admin/students/:id — edit grade, daily limits, allergies, guardian contact
router.patch('/students/:id', authMiddleware, schoolAdminMiddleware, async (req, res) => {
  const { class: cls, dailyLimitAmount, dailyLimitCount, allergies, phone } = req.body;
  const before = await db.prepare(
    'SELECT class, daily_limit_amount, daily_limit_count, allergies, phone FROM students WHERE id = ?'
  ).get(req.params.id);
  if (!before) return res.status(404).json({ error: 'Student not found' });

  const toNullableNumber = (v) => (v === undefined ? undefined : (v === null || v === '' ? null : Number(v)));
  const toNullableString = (v) => (v === undefined ? undefined : (v === null ? null : String(v).trim() || null));
  const newAmount    = toNullableNumber(dailyLimitAmount);
  const newCount     = toNullableNumber(dailyLimitCount);
  const newAllergies = toNullableString(allergies);
  const newPhone     = toNullableString(phone);

  const after = {
    class: cls || before.class,
    daily_limit_amount: newAmount !== undefined ? newAmount : before.daily_limit_amount,
    daily_limit_count: newCount !== undefined ? newCount : before.daily_limit_count,
    allergies: newAllergies !== undefined ? newAllergies : before.allergies,
    phone: newPhone !== undefined ? newPhone : before.phone,
  };

  await db.prepare(`
    UPDATE students SET class = ?, daily_limit_amount = ?, daily_limit_count = ?, allergies = ?, phone = ?
    WHERE id = ?
  `).run(after.class, after.daily_limit_amount, after.daily_limit_count, after.allergies, after.phone, req.params.id);

  await logAction(db, {
    actorId: req.user.id, actorRole: 'school_admin', action: 'student_updated',
    entity: 'students', entityId: req.params.id, before, after,
  });

  res.json({ message: 'Student updated' });
});

// GET /admin/shops — list all shops
router.get('/shops', authMiddleware, schoolAdminMiddleware, async (req, res) => {
  const shops = await db.prepare('SELECT * FROM shops ORDER BY name').all();
  res.json(shops);
});

// POST /admin/shops — add a shop
router.post('/shops', authMiddleware, schoolAdminMiddleware, async (req, res) => {
  const { name, location } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  const id = 'shop-' + uuidv4().slice(0, 8);
  await db.prepare('INSERT INTO shops (id, name, location) VALUES (?, ?, ?)').run(id, name, location || null);

  await logAction(db, {
    actorId: req.user.id, actorRole: 'school_admin', action: 'shop_created',
    entity: 'shops', entityId: id, after: { name, location: location || null },
  });

  res.status(201).json({ id, name, location: location || null, active: 1 });
});

// PATCH /admin/shops/:id — edit name/location/active
router.patch('/shops/:id', authMiddleware, schoolAdminMiddleware, async (req, res) => {
  const { name, location, active } = req.body;
  const before = await db.prepare('SELECT * FROM shops WHERE id = ?').get(req.params.id);
  if (!before) return res.status(404).json({ error: 'Shop not found' });

  const after = {
    name: name || before.name,
    location: location !== undefined ? (location || null) : before.location,
    active: active === undefined ? before.active : (active ? 1 : 0),
  };

  await db.prepare('UPDATE shops SET name = ?, location = ?, active = ? WHERE id = ?')
    .run(after.name, after.location, after.active, req.params.id);

  // Keep merchant_name in sync on any cashier accounts attached to this shop —
  // shop.js's legacy revenue/transaction-log queries still match on it.
  if (name) {
    await db.prepare('UPDATE students SET merchant_name = ? WHERE shop_id = ?').run(name, req.params.id);
  }

  await logAction(db, {
    actorId: req.user.id, actorRole: 'school_admin', action: 'shop_updated',
    entity: 'shops', entityId: req.params.id, before, after,
  });

  res.json({ message: 'Shop updated' });
});

// PATCH /admin/shop-owners/:id — edit an existing cashier's shop assignment/phone
router.patch('/shop-owners/:id', authMiddleware, schoolAdminMiddleware, async (req, res) => {
  const { shopId, phone } = req.body;
  const before = await db.prepare("SELECT * FROM students WHERE id = ? AND role = 'shop_owner'").get(req.params.id);
  if (!before) return res.status(404).json({ error: 'Cashier not found' });

  let merchantName = before.merchant_name;
  let newShopId = before.shop_id;
  if (shopId) {
    const shop = await db.prepare('SELECT id, name FROM shops WHERE id = ?').get(shopId);
    if (!shop) return res.status(404).json({ error: 'Shop not found' });
    newShopId = shop.id;
    merchantName = shop.name;
  }
  const newPhone = phone !== undefined ? (phone || null) : before.phone;

  await db.prepare('UPDATE students SET shop_id = ?, merchant_name = ?, phone = ? WHERE id = ?')
    .run(newShopId, merchantName, newPhone, req.params.id);

  await logAction(db, {
    actorId: req.user.id, actorRole: 'school_admin', action: 'cashier_updated',
    entity: 'students', entityId: req.params.id,
    before: { shop_id: before.shop_id, merchant_name: before.merchant_name, phone: before.phone },
    after: { shop_id: newShopId, merchant_name: merchantName, phone: newPhone },
  });

  res.json({ message: 'Cashier updated' });
});

// GET /admin/approvals?status=pending|approved|rejected — school-wide parent-approval holds
router.get('/approvals', authMiddleware, schoolAdminMiddleware, async (req, res) => {
  const filterStatus = PENDING_APPROVAL_STATUSES.includes(req.query.status) ? req.query.status : null;

  const rows = await db.prepare(`
    SELECT p.id, p.student_id, s.name AS student_name, s.class, p.amount, p.description, p.status,
           p.created_at::text AS created_at, p.expires_at::text AS expires_at, p.resolved_at::text AS resolved_at,
           sh.name AS shop_name
    FROM pending_purchases p
    JOIN students s ON s.id = p.student_id
    LEFT JOIN students owner ON owner.id = p.shop_owner_id
    LEFT JOIN shops sh ON sh.id = owner.shop_id
    ${filterStatus ? 'WHERE p.status = ?' : ''}
    ORDER BY p.created_at DESC
    LIMIT 200
  `).all(...(filterStatus ? [filterStatus] : []));

  const now = Date.now();
  res.json(rows.map((r) => ({
    ...r,
    timeInQueueMs: (r.resolved_at ? new Date(r.resolved_at).getTime() : now) - new Date(r.created_at).getTime(),
  })));
});

// GET /admin/reports/spending?from=&to=&shopId=&grade=&format=csv — date-range spending report
router.get('/reports/spending', authMiddleware, schoolAdminMiddleware, async (req, res) => {
  const { from, to, shopId, grade, format } = req.query;

  const conditions = ["t.type = 'debit'"];
  const params = [];
  if (from) { conditions.push('t.created_at >= ?'); params.push(from); }
  if (to) { conditions.push('t.created_at < ?'); params.push(to); }
  if (grade) { conditions.push('s.class LIKE ?'); params.push(`${grade}-%`); }
  if (shopId) {
    const shop = await db.prepare('SELECT name FROM shops WHERE id = ?').get(shopId);
    if (!shop) return res.status(404).json({ error: 'Shop not found' });
    conditions.push('t.merchant = ?');
    params.push(shop.name);
  }

  const rows = await db.prepare(`
    SELECT t.created_at::text AS created_at, t.amount, t.merchant, s.name AS student_name, s.class
    FROM transactions t JOIN students s ON s.id = t.student_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY t.created_at DESC
    LIMIT 5000
  `).all(...params);

  if (format === 'csv') {
    const header = 'Date,Student,Class,Shop,Amount';
    const csv = [header, ...rows.map((r) =>
      [r.created_at, r.student_name, r.class, r.merchant, r.amount].map(csvEscape).join(',')
    )].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="spending-report.csv"');
    return res.send(csv);
  }

  const totalAmount = rows.reduce((sum, r) => sum + Number(r.amount), 0);
  res.json({ totals: { count: rows.length, amount: Number(totalAmount.toFixed(2)) }, rows });
});

// GET /admin/reports/emergency-fund — students/families drawing on the emergency fund
router.get('/reports/emergency-fund', authMiddleware, schoolAdminMiddleware, async (req, res) => {
  const rows = await db.prepare(`
    SELECT s.id AS student_id, s.name AS student_name, s.class, s.email,
           COUNT(*)::int AS draw_count, COALESCE(SUM(t.emergency_amount), 0) AS total_drawn
    FROM transactions t
    JOIN students s ON s.id = t.student_id
    WHERE t.type = 'debit' AND t.emergency_amount > 0
    GROUP BY s.id, s.name, s.class, s.email
    ORDER BY total_drawn DESC
  `).all();

  const withParents = await Promise.all(rows.map(async (r) => {
    const parent = await getParentFor({ name: r.student_name, email: r.email });
    return {
      studentId: r.student_id, studentName: r.student_name, class: r.class,
      drawCount: r.draw_count, totalDrawn: Number(r.total_drawn),
      parentName: parent?.name || null, parentPhone: parent?.phone || null,
    };
  }));

  res.json(withParents);
});

// GET /admin/refunds?status=refund_pending|refunded — refund queue
router.get('/refunds', authMiddleware, schoolAdminMiddleware, async (req, res) => {
  const status = REFUND_QUEUE_STATUSES.includes(req.query.status) ? req.query.status : 'refund_pending';

  const rows = await db.prepare(`
    SELECT o.id, o.student_id, s.name AS student_name, s.class, sh.id AS shop_id, sh.name AS shop_name,
           o.items, o.amount, o.status, o.refund_reason, o.created_at::text AS created_at, o.refunded_at::text AS refunded_at
    FROM orders o
    JOIN students s ON s.id = o.student_id
    JOIN shops sh ON sh.id = o.shop_id
    WHERE o.status = ?
    ORDER BY o.created_at DESC
    LIMIT 200
  `).all(status);

  res.json(rows);
});

// PATCH /admin/refunds/:id/approve — credit the student back and mark refunded
router.patch('/refunds/:id/approve', authMiddleware, schoolAdminMiddleware, async (req, res) => {
  try {
    const result = await withTransaction(async (trx) => {
      const order = await trx.prepare('SELECT * FROM orders WHERE id = ? FOR UPDATE').get(req.params.id);
      if (!order) throw new HttpError(404, 'Order not found');
      if (order.status !== 'refund_pending') {
        throw new HttpError(409, `Order is not awaiting refund approval (status: ${order.status})`);
      }

      const student = await trx.prepare('SELECT * FROM students WHERE id = ? FOR UPDATE').get(order.student_id);

      // Split the refund back across main balance / emergency fund in the
      // same proportion the original sale drew from each.
      const emergencyUsed = await trx.prepare(
        'SELECT COALESCE(SUM(emergency_amount), 0) AS total FROM transactions WHERE order_id = ?'
      ).get(order.id);
      const emergencyPortion = Math.min(Number(emergencyUsed.total), order.amount);
      const mainPortion = order.amount - emergencyPortion;

      const newBalance = student.balance + mainPortion;
      const newEmergencyBalance = (student.emergency_balance || 0) + emergencyPortion;
      await trx.prepare('UPDATE students SET balance = ?, emergency_balance = ? WHERE id = ?')
        .run(newBalance, newEmergencyBalance, student.id);

      await trx.prepare(`
        INSERT INTO transactions (id, student_id, type, amount, description, merchant, balance_after, emergency_amount, order_id)
        VALUES (?, ?, 'credit', ?, ?, 'Refund', ?, ?, ?)
      `).run(
        uuidv4(), student.id, order.amount, `Refund: ${order.refund_reason || 'Cashier requested'}`,
        newBalance, emergencyPortion, order.id
      );

      const updated = await trx.prepare(
        "UPDATE orders SET status = 'refunded', refunded_at = NOW(), approved_by = ? WHERE id = ? AND status = 'refund_pending' RETURNING id"
      ).get(req.user.id, order.id);
      if (!updated) throw new HttpError(409, 'This refund was already resolved');

      await logAction(trx, {
        actorId: req.user.id, actorRole: 'school_admin', action: 'refund_approved',
        entity: 'orders', entityId: order.id,
        before: { status: 'refund_pending' }, after: { status: 'refunded', amount: order.amount },
      });

      return { message: 'Refund approved', newBalance, newEmergencyBalance };
    });
    res.json(result);
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json(err.body);
    throw err;
  }
});

// PATCH /admin/refunds/:id/reject — deny the refund request, sale stands
router.patch('/refunds/:id/reject', authMiddleware, schoolAdminMiddleware, async (req, res) => {
  const { reason } = req.body;
  const order = await db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (order.status !== 'refund_pending') {
    return res.status(409).json({ error: `Order is not awaiting refund approval (status: ${order.status})` });
  }

  const updated = await db.prepare(
    "UPDATE orders SET status = 'completed' WHERE id = ? AND status = 'refund_pending' RETURNING id"
  ).get(req.params.id);
  if (!updated) return res.status(409).json({ error: 'This refund was already resolved' });

  await logAction(db, {
    actorId: req.user.id, actorRole: 'school_admin', action: 'refund_rejected',
    entity: 'orders', entityId: order.id,
    before: { status: 'refund_pending' }, after: { status: 'completed', denialReason: reason || null },
  });

  res.json({ message: 'Refund request denied — sale stands' });
});

module.exports = router;
