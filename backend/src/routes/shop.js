import { Hono } from 'hono';
import { authMiddleware, shopOwnerMiddleware, shopStaffMiddleware } from '../middleware/auth.js';
import { logAction } from '../services/auditLog.js';
import { csvEscape } from '../utils/csv.js';

const app = new Hono();

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const EXPORT_ROW_CAP = 5000;
const ORDER_STATUSES = ['completed', 'pending_approval', 'rejected', 'refund_pending', 'refunded'];

async function getMerchantName(db, userId) {
  const row = await db.prepare('SELECT merchant_name FROM students WHERE id = ?').get(userId);
  return row?.merchant_name;
}

async function getShopId(db, userId) {
  const row = await db.prepare('SELECT shop_id FROM students WHERE id = ?').get(userId);
  return row?.shop_id || null;
}

// Builds the shared WHERE-clause conditions/params for both the paginated
// list and the CSV export, so the two endpoints can never drift out of sync
// on what "the current filtered view" means.
function buildOrderFilter(shopId, { status, from, to, q }) {
  const conditions = ['o.shop_id = ?'];
  const params = [shopId];

  if (status && ORDER_STATUSES.includes(status)) {
    conditions.push('o.status = ?');
    params.push(status);
  }
  if (from) {
    conditions.push('o.created_at >= ?');
    params.push(from);
  }
  if (to) {
    conditions.push('o.created_at < ?');
    params.push(to);
  }
  if (q) {
    conditions.push('s.name ILIKE ?');
    params.push(`%${q}%`);
  }

  return { conditions, params };
}

function encodeCursor(row) {
  return btoa(`${row.created_at}|${row.id}`);
}

function decodeCursor(cursor) {
  try {
    const [createdAt, id] = atob(cursor).split('|');
    if (!createdAt || !id) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}

function orderToCsvRow(o) {
  const itemsSummary = (o.items || []).map((i) => `${i.name} x${i.quantity}`).join('; ');
  return [o.created_at, o.student_name, o.class, itemsSummary, o.amount, o.status, o.refund_reason || '']
    .map(csvEscape)
    .join(',');
}

// GET /shop/stats — today's sales summary for this shop
app.get('/stats', authMiddleware, shopStaffMiddleware, async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const merchant = await getMerchantName(db, user.id);
  const shopId = await getShopId(db, user.id);

  const today = await db
    .prepare(
      `
    SELECT COUNT(*)::int AS count, COALESCE(SUM(amount), 0) AS revenue
    FROM transactions
    WHERE merchant = ? AND type = 'debit' AND created_at::date = CURRENT_DATE
  `
    )
    .get(merchant);

  const pending = shopId
    ? await db
        .prepare(`SELECT COUNT(*)::int AS count FROM orders WHERE shop_id = ? AND status = 'pending_approval'`)
        .get(shopId)
    : { count: 0 };

  return c.json({
    todayRevenue: today.revenue,
    todayTransactions: today.count,
    pendingApprovals: pending.count,
  });
});

// GET /shop/transactions — this shop's transaction log (legacy — powers the
// existing cashier Dashboard; the Orders tab uses GET /shop/orders instead)
app.get('/transactions', authMiddleware, shopStaffMiddleware, async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const merchant = await getMerchantName(db, user.id);

  // t.* already includes t.student_id — no join-side alias needed for it.
  const txns = await db
    .prepare(
      `
    SELECT t.*, s.name AS student_name, s.class
    FROM transactions t JOIN students s ON t.student_id = s.id
    WHERE t.merchant = ?
    ORDER BY t.created_at DESC LIMIT 100
  `
    )
    .all(merchant);

  return c.json(txns);
});

// GET /shop/orders — cursor-paginated order list, scoped to the caller's shop.
// ?status=&from=&to=&q=&cursor=&limit=
app.get('/orders', authMiddleware, shopStaffMiddleware, async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const shopId = await getShopId(db, user.id);
  if (!shopId) return c.json({ orders: [], nextCursor: null });

  const status = c.req.query('status');
  const from = c.req.query('from');
  const to = c.req.query('to');
  const q = c.req.query('q');
  const limit = Math.min(Number(c.req.query('limit')) || DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);

  const { conditions, params } = buildOrderFilter(shopId, { status, from, to, q });

  const cursor = c.req.query('cursor');
  if (cursor) {
    const decoded = decodeCursor(cursor);
    if (decoded) {
      conditions.push('(o.created_at, o.id) < (?, ?)');
      params.push(decoded.createdAt, decoded.id);
    }
  }

  const rows = await db
    .prepare(
      `
    SELECT o.id, o.student_id, s.name AS student_name, s.class, o.items, o.amount, o.status,
           o.refund_reason, o.refunded_at, o.created_at::text AS created_at
    FROM orders o
    JOIN students s ON s.id = o.student_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY o.created_at DESC, o.id DESC
    LIMIT ?
  `
    )
    .all(...params, limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  return c.json({
    orders: page,
    nextCursor: hasMore ? encodeCursor(page[page.length - 1]) : null,
  });
});

// PATCH /shop/orders/:id/refund — cashier requests a refund. Does not touch
// the student's balance: every refund needs school-admin approval first
// (see PATCH /admin/refunds/:id/approve).
app.patch('/orders/:id/refund', authMiddleware, shopOwnerMiddleware, async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const id = c.req.param('id');
  const { reason } = await c.req.json();
  if (!reason || !String(reason).trim()) {
    return c.json({ error: 'A refund reason is required' }, 400);
  }

  const shopId = await getShopId(db, user.id);
  const order = await db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  if (!order || order.shop_id !== shopId) return c.json({ error: 'Order not found' }, 404);
  if (order.status !== 'completed') {
    return c.json({ error: `Cannot refund an order with status "${order.status}"` }, 409);
  }

  const trimmedReason = String(reason).trim();
  const updated = await db
    .prepare(
      `
    UPDATE orders SET status = 'refund_pending', refund_reason = ?
    WHERE id = ? AND status = 'completed' RETURNING id
  `
    )
    .get(trimmedReason, id);
  if (!updated) return c.json({ error: 'This order was already updated' }, 409);

  await logAction(db, {
    actorId: user.id,
    actorRole: 'shop_owner',
    action: 'refund_requested',
    entity: 'orders',
    entityId: order.id,
    before: { status: 'completed' },
    after: { status: 'refund_pending', reason: trimmedReason },
  });

  return c.json({ message: 'Refund requested — awaiting school admin approval' });
});

// GET /shop/orders/export — CSV of the current filtered view, capped for safety.
app.get('/orders/export', authMiddleware, shopStaffMiddleware, async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const shopId = await getShopId(db, user.id);
  if (!shopId) return c.json({ error: 'Your account is not linked to a shop' }, 400);

  const status = c.req.query('status');
  const from = c.req.query('from');
  const to = c.req.query('to');
  const q = c.req.query('q');
  const { conditions, params } = buildOrderFilter(shopId, { status, from, to, q });

  const rows = await db
    .prepare(
      `
    SELECT s.name AS student_name, s.class, o.items, o.amount, o.status, o.refund_reason,
           o.created_at::text AS created_at
    FROM orders o
    JOIN students s ON s.id = o.student_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY o.created_at DESC
    LIMIT ?
  `
    )
    .all(...params, EXPORT_ROW_CAP);

  const header = 'Date,Student,Class,Items,Amount,Status,Refund Reason';
  const csv = [header, ...rows.map(orderToCsvRow)].join('\n');

  return c.body(csv, 200, {
    'Content-Type': 'text/csv',
    'Content-Disposition': `attachment; filename="orders-${new Date().toISOString().slice(0, 10)}.csv"`,
  });
});

export default app;
