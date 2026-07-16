import { Hono } from 'hono';
import { v4 as uuidv4 } from 'uuid';
import { authMiddleware, superAdminMiddleware } from '../middleware/auth.js';

const app = new Hono();

// All superadmin routes require authentication + super_admin role
app.use('*', authMiddleware, superAdminMiddleware);

// ── Platform Dashboard ──────────────────────────────────────────────────────

// GET /superadmin/dashboard — cross-school platform stats
app.get('/dashboard', async (c) => {
  const db = c.get('db');

  const totalSchools = await db.prepare('SELECT COUNT(*)::int AS count FROM schools').get();
  const activeSchools = await db.prepare('SELECT COUNT(*)::int AS count FROM schools WHERE active = 1').get();
  const totalStudents = await db
    .prepare("SELECT COUNT(*)::int AS count FROM students WHERE role = 'student' AND active = 1")
    .get();
  const totalParents = await db
    .prepare("SELECT COUNT(*)::int AS count FROM students WHERE role = 'parent' AND active = 1")
    .get();
  const totalShopOwners = await db
    .prepare("SELECT COUNT(*)::int AS count FROM students WHERE role = 'shop_owner' AND active = 1")
    .get();
  const totalTransactions = await db
    .prepare("SELECT COUNT(*)::int AS count, COALESCE(SUM(amount), 0) AS total FROM transactions WHERE type = 'debit'")
    .get();
  const activeSubscriptions = await db
    .prepare("SELECT COUNT(*)::int AS count FROM subscriptions WHERE status IN ('active', 'trialing')")
    .get();

  // Revenue this month (from all schools)
  const monthlyRevenue = await db
    .prepare(
      `
    SELECT COALESCE(SUM(p.monthly_price), 0) AS revenue
    FROM subscriptions s
    JOIN plans p ON p.id = s.plan_id
    WHERE s.status IN ('active', 'trialing')
  `
    )
    .get();

  // Recent signups (last 7 days)
  const recentSchools = await db
    .prepare(
      `
    SELECT id, name, created_at FROM schools
    ORDER BY created_at DESC LIMIT 5
  `
    )
    .all();

  return c.json({
    schools: { total: totalSchools.count, active: activeSchools.count },
    users: {
      students: totalStudents.count,
      parents: totalParents.count,
      shopOwners: totalShopOwners.count,
    },
    transactions: { count: totalTransactions.count, totalVolume: totalTransactions.total },
    subscriptions: { active: activeSubscriptions.count },
    revenue: { monthly: monthlyRevenue.revenue },
    recentSchools,
  });
});

// ── Schools CRUD ────────────────────────────────────────────────────────────

// GET /superadmin/schools — list all schools with stats
app.get('/schools', async (c) => {
  const db = c.get('db');
  const schools = await db
    .prepare(
      `
    SELECT s.*,
      (SELECT COUNT(*)::int FROM students st WHERE st.school_id = s.id AND st.role = 'student' AND st.active = 1) AS student_count,
      (SELECT COUNT(*)::int FROM shops sh WHERE sh.school_id = s.id AND sh.active = 1) AS shop_count,
      (SELECT sub.status FROM subscriptions sub WHERE sub.school_id = s.id ORDER BY sub.created_at DESC LIMIT 1) AS subscription_status,
      (SELECT p.name FROM subscriptions sub JOIN plans p ON p.id = sub.plan_id WHERE sub.school_id = s.id ORDER BY sub.created_at DESC LIMIT 1) AS plan_name
    FROM schools s
    ORDER BY s.created_at DESC
  `
    )
    .all();
  return c.json(schools);
});

// GET /superadmin/schools/:id — single school detail
app.get('/schools/:id', async (c) => {
  const db = c.get('db');
  const id = c.req.param('id');
  const school = await db.prepare('SELECT * FROM schools WHERE id = ?').get(id);
  if (!school) return c.json({ error: 'School not found' }, 404);

  const stats = await db
    .prepare(
      `
    SELECT
      (SELECT COUNT(*)::int FROM students WHERE school_id = ? AND role = 'student' AND active = 1) AS student_count,
      (SELECT COUNT(*)::int FROM students WHERE school_id = ? AND role = 'school_admin' AND active = 1) AS admin_count,
      (SELECT COUNT(*)::int FROM shops WHERE school_id = ? AND active = 1) AS shop_count,
      (SELECT COUNT(*)::int FROM transactions t JOIN students st ON st.id = t.student_id WHERE st.school_id = ? AND t.type = 'debit') AS transaction_count,
      (SELECT COALESCE(SUM(t.amount), 0) FROM transactions t JOIN students st ON st.id = t.student_id WHERE st.school_id = ? AND t.type = 'debit') AS total_volume
  `
    )
    .get(id, id, id, id, id);

  const subscription = await db
    .prepare(
      `
    SELECT sub.*, p.name AS plan_name, p.monthly_price, p.student_limit, p.shop_limit
    FROM subscriptions sub
    JOIN plans p ON p.id = sub.plan_id
    WHERE sub.school_id = ?
    ORDER BY sub.created_at DESC LIMIT 1
  `
    )
    .get(id);

  return c.json({ ...school, stats, subscription });
});

// POST /superadmin/schools — create a new school
app.post('/schools', async (c) => {
  const db = c.get('db');
  const body = await c.req.json();
  const { name, contactEmail, contactPhone, address } = body;

  if (!name) return c.json({ error: 'School name is required' }, 400);

  const id = 'school-' + uuidv4().slice(0, 8);
  await db
    .prepare(
      `
    INSERT INTO schools (id, name, contact_email, contact_phone, address)
    VALUES (?, ?, ?, ?, ?)
  `
    )
    .run(id, name, contactEmail || null, contactPhone || null, address || null);

  // Auto-assign a free trial subscription
  const freePlan = await db.prepare("SELECT id FROM plans WHERE name = 'Free Trial' LIMIT 1").get();
  if (freePlan) {
    const subId = 'sub-' + uuidv4().slice(0, 8);
    await db
      .prepare(
        `
      INSERT INTO subscriptions (id, school_id, plan_id, status, trial_ends_at, current_period_start, current_period_end)
      VALUES (?, ?, ?, 'trialing', NOW() + INTERVAL '14 days', NOW(), NOW() + INTERVAL '14 days')
    `
      )
      .run(subId, id, freePlan.id);
  }

  const school = await db.prepare('SELECT * FROM schools WHERE id = ?').get(id);
  return c.json(school, 201);
});

// PATCH /superadmin/schools/:id — update school details
app.patch('/schools/:id', async (c) => {
  const db = c.get('db');
  const id = c.req.param('id');
  const body = await c.req.json();
  const school = await db.prepare('SELECT * FROM schools WHERE id = ?').get(id);
  if (!school) return c.json({ error: 'School not found' }, 404);

  const { name, contactEmail, contactPhone, address, logoUrl, active } = body;
  await db
    .prepare(
      `
    UPDATE schools SET
      name = COALESCE(?, name),
      contact_email = COALESCE(?, contact_email),
      contact_phone = COALESCE(?, contact_phone),
      address = COALESCE(?, address),
      logo_url = COALESCE(?, logo_url),
      active = COALESCE(?, active)
    WHERE id = ?
  `
    )
    .run(
      name || null,
      contactEmail || null,
      contactPhone || null,
      address || null,
      logoUrl || null,
      active !== undefined ? (active ? 1 : 0) : null,
      id
    );

  const updated = await db.prepare('SELECT * FROM schools WHERE id = ?').get(id);
  return c.json(updated);
});

// ── Plans Management ────────────────────────────────────────────────────────

// GET /superadmin/plans — list all plans
app.get('/plans', async (c) => {
  const db = c.get('db');
  const plans = await db
    .prepare(
      `
    SELECT p.*,
      (SELECT COUNT(*)::int FROM subscriptions s WHERE s.plan_id = p.id AND s.status IN ('active', 'trialing')) AS subscriber_count
    FROM plans p
    ORDER BY p.monthly_price ASC
  `
    )
    .all();
  return c.json(plans);
});

// POST /superadmin/plans — create a new plan
app.post('/plans', async (c) => {
  const db = c.get('db');
  const body = await c.req.json();
  const { name, monthlyPrice, studentLimit, shopLimit, features } = body;

  if (!name) return c.json({ error: 'Plan name is required' }, 400);

  const id = 'plan-' + uuidv4().slice(0, 8);
  await db
    .prepare(
      `
    INSERT INTO plans (id, name, monthly_price, student_limit, shop_limit, features)
    VALUES (?, ?, ?, ?, ?, ?)
  `
    )
    .run(id, name, monthlyPrice || 0, studentLimit || null, shopLimit || null, JSON.stringify(features || []));

  const plan = await db.prepare('SELECT * FROM plans WHERE id = ?').get(id);
  return c.json(plan, 201);
});

// PATCH /superadmin/plans/:id — update a plan
app.patch('/plans/:id', async (c) => {
  const db = c.get('db');
  const id = c.req.param('id');
  const body = await c.req.json();
  const plan = await db.prepare('SELECT * FROM plans WHERE id = ?').get(id);
  if (!plan) return c.json({ error: 'Plan not found' }, 404);

  const { name, monthlyPrice, studentLimit, shopLimit, features, active } = body;
  await db
    .prepare(
      `
    UPDATE plans SET
      name = COALESCE(?, name),
      monthly_price = COALESCE(?, monthly_price),
      student_limit = COALESCE(?, student_limit),
      shop_limit = COALESCE(?, shop_limit),
      features = COALESCE(?, features),
      active = COALESCE(?, active)
    WHERE id = ?
  `
    )
    .run(
      name || null,
      monthlyPrice !== undefined ? monthlyPrice : null,
      studentLimit !== undefined ? studentLimit : null,
      shopLimit !== undefined ? shopLimit : null,
      features ? JSON.stringify(features) : null,
      active !== undefined ? (active ? 1 : 0) : null,
      id
    );

  const updated = await db.prepare('SELECT * FROM plans WHERE id = ?').get(id);
  return c.json(updated);
});

// ── Subscriptions Management ────────────────────────────────────────────────

// GET /superadmin/subscriptions — list all subscriptions
app.get('/subscriptions', async (c) => {
  const db = c.get('db');
  const subs = await db
    .prepare(
      `
    SELECT sub.*, sc.name AS school_name, p.name AS plan_name, p.monthly_price
    FROM subscriptions sub
    JOIN schools sc ON sc.id = sub.school_id
    JOIN plans p ON p.id = sub.plan_id
    ORDER BY sub.created_at DESC
  `
    )
    .all();
  return c.json(subs);
});

// POST /superadmin/subscriptions — assign/change a school's subscription
app.post('/subscriptions', async (c) => {
  const db = c.get('db');
  const body = await c.req.json();
  const { schoolId, planId, billingCycle } = body;

  if (!schoolId || !planId) return c.json({ error: 'schoolId and planId are required' }, 400);

  const school = await db.prepare('SELECT id FROM schools WHERE id = ?').get(schoolId);
  if (!school) return c.json({ error: 'School not found' }, 404);

  const plan = await db.prepare('SELECT id FROM plans WHERE id = ?').get(planId);
  if (!plan) return c.json({ error: 'Plan not found' }, 404);

  // Cancel any existing active subscription for this school
  await db
    .prepare(
      `
    UPDATE subscriptions SET status = 'cancelled', cancelled_at = NOW()
    WHERE school_id = ? AND status IN ('active', 'trialing')
  `
    )
    .run(schoolId);

  // Create new subscription
  const id = 'sub-' + uuidv4().slice(0, 8);
  await db
    .prepare(
      `
    INSERT INTO subscriptions (id, school_id, plan_id, status, billing_cycle, current_period_start, current_period_end)
    VALUES (?, ?, ?, 'active', ?, NOW(), NOW() + INTERVAL '30 days')
  `
    )
    .run(id, schoolId, planId, billingCycle || 'monthly');

  const sub = await db
    .prepare(
      `
    SELECT sub.*, sc.name AS school_name, p.name AS plan_name
    FROM subscriptions sub
    JOIN schools sc ON sc.id = sub.school_id
    JOIN plans p ON p.id = sub.plan_id
    WHERE sub.id = ?
  `
    )
    .get(id);
  return c.json(sub, 201);
});

// PATCH /superadmin/subscriptions/:id — update subscription status
app.patch('/subscriptions/:id', async (c) => {
  const db = c.get('db');
  const id = c.req.param('id');
  const body = await c.req.json();
  const sub = await db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(id);
  if (!sub) return c.json({ error: 'Subscription not found' }, 404);

  const { status, planId, billingCycle } = body;
  await db
    .prepare(
      `
    UPDATE subscriptions SET
      status = COALESCE(?, status),
      plan_id = COALESCE(?, plan_id),
      billing_cycle = COALESCE(?, billing_cycle),
      cancelled_at = CASE WHEN ? = 'cancelled' THEN NOW() ELSE cancelled_at END
    WHERE id = ?
  `
    )
    .run(status || null, planId || null, billingCycle || null, status || null, id);

  const updated = await db
    .prepare(
      `
    SELECT sub.*, sc.name AS school_name, p.name AS plan_name
    FROM subscriptions sub
    JOIN schools sc ON sc.id = sub.school_id
    JOIN plans p ON p.id = sub.plan_id
    WHERE sub.id = ?
  `
    )
    .get(id);
  return c.json(updated);
});

// ── Super Admin Management ──────────────────────────────────────────────────

// GET /superadmin/admins — list all super admins
app.get('/admins', async (c) => {
  const db = c.get('db');
  const admins = await db
    .prepare("SELECT id, name, email FROM students WHERE role = 'super_admin' ORDER BY name")
    .all();
  return c.json(admins);
});

// POST /superadmin/admins — create a new super admin (bootstrap)
app.post('/admins', async (c) => {
  const db = c.get('db');
  const body = await c.req.json();
  const { name, email, pin } = body;

  if (!name || !email || !pin) return c.json({ error: 'name, email and pin are required' }, 400);

  const existing = await db.prepare('SELECT id FROM students WHERE email = ?').get(email);
  if (existing) return c.json({ error: 'Email already registered' }, 409);

  const bcrypt = await import('bcryptjs');
  const id = 'superadmin-' + uuidv4().slice(0, 8);
  const pinHash = bcrypt.default.hashSync(String(pin), 10);

  await db
    .prepare(
      `
    INSERT INTO students (id, name, email, class, balance, pin_hash, role, school_id)
    VALUES (?, ?, ?, 'Platform', 0, ?, 'super_admin', NULL)
  `
    )
    .run(id, name, email, pinHash);

  return c.json({ id, name, email, role: 'super_admin' }, 201);
});

export default app;
