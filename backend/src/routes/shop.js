const router = require('express').Router();
const { db } = require('../db/schema');
const { authMiddleware, shopOwnerMiddleware } = require('../middleware/auth');
const { logAction } = require('../services/auditLog');
const { csvEscape } = require('../utils/csv');

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const EXPORT_ROW_CAP = 5000;
const ORDER_STATUSES = ['completed', 'pending_approval', 'rejected', 'refund_pending', 'refunded'];

async function getMerchantName(userId) {
  const row = await db.prepare('SELECT merchant_name FROM students WHERE id = ?').get(userId);
  return row?.merchant_name;
}

async function getShopId(userId) {
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
  if (from) { conditions.push('o.created_at >= ?'); params.push(from); }
  if (to) { conditions.push('o.created_at < ?'); params.push(to); }
  if (q) { conditions.push('s.name ILIKE ?'); params.push(`%${q}%`); }

  return { conditions, params };
}

function encodeCursor(row) {
  return Buffer.from(`${row.created_at}|${row.id}`).toString('base64');
}

function decodeCursor(cursor) {
  try {
    const [createdAt, id] = Buffer.from(cursor, 'base64').toString('utf8').split('|');
    if (!createdAt || !id) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}

function orderToCsvRow(o) {
  const itemsSummary = (o.items || []).map((i) => `${i.name} x${i.quantity}`).join('; ');
  return [o.created_at, o.student_name, o.class, itemsSummary, o.amount, o.status, o.refund_reason || '']
    .map(csvEscape).join(',');
}

// GET /shop/stats — today's sales summary for this shop
router.get('/stats', authMiddleware, shopOwnerMiddleware, async (req, res) => {
  const merchant = await getMerchantName(req.user.id);
  const shopId = await getShopId(req.user.id);

  const today = await db.prepare(`
    SELECT COUNT(*)::int AS count, COALESCE(SUM(amount), 0) AS revenue
    FROM transactions
    WHERE merchant = ? AND type = 'debit' AND created_at::date = CURRENT_DATE
  `).get(merchant);

  const pending = shopId
    ? await db.prepare(`SELECT COUNT(*)::int AS count FROM orders WHERE shop_id = ? AND status = 'pending_approval'`).get(shopId)
    : { count: 0 };

  res.json({
    todayRevenue: today.revenue,
    todayTransactions: today.count,
    pendingApprovals: pending.count,
  });
});

// GET /shop/transactions — this shop's transaction log (legacy — powers the
// existing cashier Dashboard; the Orders tab uses GET /shop/orders instead)
router.get('/transactions', authMiddleware, shopOwnerMiddleware, async (req, res) => {
  const merchant = await getMerchantName(req.user.id);

  // t.* already includes t.student_id — no join-side alias needed for it.
  const txns = await db.prepare(`
    SELECT t.*, s.name AS student_name, s.class
    FROM transactions t JOIN students s ON t.student_id = s.id
    WHERE t.merchant = ?
    ORDER BY t.created_at DESC LIMIT 100
  `).all(merchant);

  res.json(txns);
});

// GET /shop/orders — cursor-paginated order list, scoped to the caller's shop.
// ?status=&from=&to=&q=&cursor=&limit=
router.get('/orders', authMiddleware, shopOwnerMiddleware, async (req, res) => {
  const shopId = await getShopId(req.user.id);
  if (!shopId) return res.json({ orders: [], nextCursor: null });

  const { status, from, to, q } = req.query;
  const limit = Math.min(Number(req.query.limit) || DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);

  const { conditions, params } = buildOrderFilter(shopId, { status, from, to, q });

  if (req.query.cursor) {
    const decoded = decodeCursor(req.query.cursor);
    if (decoded) {
      conditions.push('(o.created_at, o.id) < (?, ?)');
      params.push(decoded.createdAt, decoded.id);
    }
  }

  const rows = await db.prepare(`
    SELECT o.id, o.student_id, s.name AS student_name, s.class, o.items, o.amount, o.status,
           o.refund_reason, o.refunded_at, o.created_at::text AS created_at
    FROM orders o
    JOIN students s ON s.id = o.student_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY o.created_at DESC, o.id DESC
    LIMIT ?
  `).all(...params, limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  res.json({
    orders: page,
    nextCursor: hasMore ? encodeCursor(page[page.length - 1]) : null,
  });
});

// PATCH /shop/orders/:id/refund — cashier requests a refund. Does not touch
// the student's balance: every refund needs school-admin approval first
// (see PATCH /admin/refunds/:id/approve).
router.patch('/orders/:id/refund', authMiddleware, shopOwnerMiddleware, async (req, res) => {
  const { reason } = req.body;
  if (!reason || !String(reason).trim()) {
    return res.status(400).json({ error: 'A refund reason is required' });
  }

  const shopId = await getShopId(req.user.id);
  const order = await db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order || order.shop_id !== shopId) return res.status(404).json({ error: 'Order not found' });
  if (order.status !== 'completed') {
    return res.status(409).json({ error: `Cannot refund an order with status "${order.status}"` });
  }

  const trimmedReason = String(reason).trim();
  const updated = await db.prepare(`
    UPDATE orders SET status = 'refund_pending', refund_reason = ?
    WHERE id = ? AND status = 'completed' RETURNING id
  `).get(trimmedReason, req.params.id);
  if (!updated) return res.status(409).json({ error: 'This order was already updated' });

  await logAction(db, {
    actorId: req.user.id, actorRole: 'shop_owner', action: 'refund_requested',
    entity: 'orders', entityId: order.id,
    before: { status: 'completed' }, after: { status: 'refund_pending', reason: trimmedReason },
  });

  res.json({ message: 'Refund requested — awaiting school admin approval' });
});

// GET /shop/orders/export — CSV of the current filtered view, capped for safety.
router.get('/orders/export', authMiddleware, shopOwnerMiddleware, async (req, res) => {
  const shopId = await getShopId(req.user.id);
  if (!shopId) return res.status(400).json({ error: 'Your account is not linked to a shop' });

  const { status, from, to, q } = req.query;
  const { conditions, params } = buildOrderFilter(shopId, { status, from, to, q });

  const rows = await db.prepare(`
    SELECT s.name AS student_name, s.class, o.items, o.amount, o.status, o.refund_reason,
           o.created_at::text AS created_at
    FROM orders o
    JOIN students s ON s.id = o.student_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY o.created_at DESC
    LIMIT ?
  `).all(...params, EXPORT_ROW_CAP);

  const header = 'Date,Student,Class,Items,Amount,Status,Refund Reason';
  const csv = [header, ...rows.map(orderToCsvRow)].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="orders-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(csv);
});

module.exports = router;
