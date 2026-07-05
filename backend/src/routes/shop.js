const router = require('express').Router();
const { db } = require('../db/schema');
const { authMiddleware, shopOwnerMiddleware } = require('../middleware/auth');

function getMerchantName(userId) {
  return db.prepare('SELECT merchant_name FROM students WHERE id = ?').get(userId)?.merchant_name;
}

// GET /shop/stats — today's sales summary for this shop
router.get('/stats', authMiddleware, shopOwnerMiddleware, (req, res) => {
  const merchant = getMerchantName(req.user.id);

  const today = db.prepare(`
    SELECT COUNT(*) AS count, COALESCE(SUM(amount), 0) AS revenue
    FROM transactions
    WHERE merchant = ? AND type = 'debit' AND date(created_at) = date('now')
  `).get(merchant);

  res.json({
    todayRevenue: today.revenue,
    todayTransactions: today.count,
  });
});

// GET /shop/transactions — this shop's transaction log
router.get('/transactions', authMiddleware, shopOwnerMiddleware, (req, res) => {
  const merchant = getMerchantName(req.user.id);

  const txns = db.prepare(`
    SELECT t.*, s.name AS student_name, s.class
    FROM transactions t JOIN students s ON t.student_id = s.id
    WHERE t.merchant = ?
    ORDER BY t.created_at DESC LIMIT 100
  `).all(merchant);

  res.json(txns);
});

module.exports = router;
