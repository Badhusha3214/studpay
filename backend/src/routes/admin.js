const router = require('express').Router();
const { db } = require('../db/schema');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

// GET /admin/students — list all students
router.get('/students', authMiddleware, adminMiddleware, (req, res) => {
  const students = db.prepare(
    "SELECT id, name, email, class, balance, role, created_at FROM students ORDER BY name"
  ).all();
  res.json(students);
});

// GET /admin/transactions — all recent transactions
router.get('/transactions', authMiddleware, adminMiddleware, (req, res) => {
  const txns = db.prepare(`
    SELECT t.*, s.name AS student_name, s.class
    FROM transactions t JOIN students s ON t.student_id = s.id
    ORDER BY t.created_at DESC LIMIT 100
  `).all();
  res.json(txns);
});

// GET /admin/stats — dashboard stats
router.get('/stats', authMiddleware, adminMiddleware, (req, res) => {
  const totalStudents = db.prepare("SELECT COUNT(*) AS count FROM students WHERE role = 'student'").get();
  const totalCards = db.prepare("SELECT COUNT(*) AS count FROM cards WHERE active = 1").get();
  const totalRevenue = db.prepare("SELECT SUM(amount) AS total FROM transactions WHERE type = 'debit'").get();
  const todayTxns = db.prepare(`
    SELECT COUNT(*) AS count FROM transactions
    WHERE date(created_at) = date('now')
  `).get();

  res.json({
    totalStudents: totalStudents.count,
    totalCards: totalCards.count,
    totalRevenue: totalRevenue.total || 0,
    todayTransactions: todayTxns.count,
  });
});

module.exports = router;
