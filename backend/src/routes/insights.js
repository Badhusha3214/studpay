import { Hono } from 'hono';
import { authMiddleware, parentMiddleware } from '../middleware/auth.js';
import { requireOwnChild } from './parent.js';

const app = new Hono();

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function currentMonth() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

// Rule-based (not ML) weighted formula: healthy purchases raise the score,
// junk/beverage purchases lower it. Clamped to a 0-100 display range.
function healthScoreFor(healthyPct, junkPct, beveragePct) {
  const raw = healthyPct * 1.0 - junkPct * 0.5 - beveragePct * 0.3;
  return Math.round(Math.max(0, Math.min(100, raw)));
}

function labelFor(score) {
  if (score >= 70) return 'Great';
  if (score >= 40) return 'Okay';
  return 'Needs Attention';
}

// GET /api/insights/:studentId/monthly?month=YYYY-MM
// Categorized spending + a simple health score for a parent's own child.
app.get('/:studentId/monthly', authMiddleware, parentMiddleware, async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const studentId = c.req.param('studentId');
  if (!(await requireOwnChild(db, user, studentId))) return c.json({ error: 'Not your child' }, 403);

  const month = MONTH_RE.test(c.req.query('month') || '') ? c.req.query('month') : currentMonth();
  const [year, mon] = month.split('-').map(Number);
  const start = new Date(Date.UTC(year, mon - 1, 1)).toISOString();
  const end = new Date(Date.UTC(year, mon, 1)).toISOString();

  // EXTRACT(HOUR ...) is computed in Postgres (not JS Date) to avoid any
  // client/server timezone mismatch when interpreting the stored timestamp.
  const rows = await db
    .prepare(
      `
    SELECT t.id, t.amount, t.item_id, m.name AS item_name, m.category AS category,
           EXTRACT(HOUR FROM t.created_at)::int AS hour
    FROM transactions t
    LEFT JOIN menu_items m ON m.id = t.item_id
    WHERE t.student_id = ? AND t.type = 'debit'
      AND t.created_at >= ? AND t.created_at < ?
  `
    )
    .all(studentId, start, end);

  let totalSpend = 0;
  let earlyCount = 0;
  const categoryAgg = {};
  const itemAgg = {};

  for (const r of rows) {
    const amt = Number(r.amount);
    totalSpend += amt;

    const cat = r.category || 'uncategorized';
    if (!categoryAgg[cat]) categoryAgg[cat] = { count: 0, spend: 0 };
    categoryAgg[cat].count += 1;
    categoryAgg[cat].spend += amt;

    if (r.item_id) {
      if (!itemAgg[r.item_id]) {
        itemAgg[r.item_id] = { name: r.item_name, category: r.category, count: 0, spend: 0 };
      }
      itemAgg[r.item_id].count += 1;
      itemAgg[r.item_id].spend += amt;
    }

    if (r.hour < 9) earlyCount += 1;
  }

  const transactionCount = rows.length;
  const pctOfSpend = (spend) => (totalSpend > 0 ? (spend / totalSpend) * 100 : 0);
  const junkPct = pctOfSpend(categoryAgg.junk?.spend || 0);
  const healthyPct = pctOfSpend(categoryAgg.healthy?.spend || 0);
  const beveragePct = pctOfSpend(categoryAgg.beverage?.spend || 0);

  const healthScore = transactionCount > 0 ? healthScoreFor(healthyPct, junkPct, beveragePct) : null;
  const healthLabel = transactionCount > 0 ? labelFor(healthScore) : 'No Data';

  const earlyPurchasePct = transactionCount > 0 ? (earlyCount / transactionCount) * 100 : 0;

  const categoryBreakdown = Object.entries(categoryAgg)
    .map(([category, v]) => ({ category, count: v.count, spend: Number(v.spend.toFixed(2)) }))
    .sort((a, b) => b.spend - a.spend);

  const topItems = Object.entries(itemAgg)
    .map(([itemId, v]) => ({
      item_id: itemId,
      name: v.name,
      category: v.category,
      count: v.count,
      spend: Number(v.spend.toFixed(2)),
    }))
    .sort((a, b) => b.count - a.count || b.spend - a.spend)
    .slice(0, 3);

  return c.json({
    studentId,
    month,
    totalSpend: Number(totalSpend.toFixed(2)),
    transactionCount,
    categoryBreakdown,
    topItems,
    junkPct: Number(junkPct.toFixed(1)),
    healthyPct: Number(healthyPct.toFixed(1)),
    beveragePct: Number(beveragePct.toFixed(1)),
    healthScore,
    healthLabel,
    earlyPurchasePct: Number(earlyPurchasePct.toFixed(1)),
    skippedBreakfastSignal: earlyPurchasePct > 30,
  });
});

export default app;
