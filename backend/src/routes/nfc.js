const router = require('express').Router();
const { db } = require('../db/schema');
const { authMiddleware, shopOwnerMiddleware } = require('../middleware/auth');
const { registerCard } = require('../services/cards');

// GET /nfc/cards — list all NFC cards with student info
router.get('/cards', authMiddleware, shopOwnerMiddleware, async (req, res) => {
  const cards = await db.prepare(`
    SELECT c.id, c.uid, c.active, c.linked_at,
           s.id AS student_id, s.name, s.class, s.email, s.balance
    FROM cards c
    JOIN students s ON c.student_id = s.id
    ORDER BY c.linked_at DESC
  `).all();
  res.json(cards);
});

// GET /nfc/cards/:uid — get a single card by UID
router.get('/cards/:uid', authMiddleware, shopOwnerMiddleware, async (req, res) => {
  const card = await db.prepare(`
    SELECT c.id, c.uid, c.active, c.linked_at,
           s.id AS student_id, s.name, s.class, s.email, s.balance
    FROM cards c JOIN students s ON c.student_id = s.id
    WHERE c.uid = ?
  `).get(req.params.uid.toUpperCase());
  if (!card) return res.status(404).json({ error: 'Card not found' });

  const txns = await db.prepare(
    'SELECT * FROM transactions WHERE student_id = ? ORDER BY created_at DESC LIMIT 20'
  ).all(card.student_id);

  res.json({ ...card, recentTransactions: txns });
});

// POST /nfc/lookup — find student by NFC UID (merchant terminal)
router.post('/lookup', authMiddleware, shopOwnerMiddleware, async (req, res) => {
  const { uid } = req.body;
  if (!uid) return res.status(400).json({ error: 'NFC UID required' });

  const card = await db.prepare('SELECT * FROM cards WHERE uid = ? AND active = 1').get(uid.toUpperCase());
  if (!card) return res.status(404).json({ error: 'Card not registered or inactive' });

  const student = await db.prepare(
    'SELECT id, name, email, class, balance, allergies FROM students WHERE id = ?'
  ).get(card.student_id);

  res.json({ card, student });
});

// POST /nfc/register — link an NFC card UID to a student
router.post('/register', authMiddleware, shopOwnerMiddleware, async (req, res) => {
  const { uid, studentId } = req.body;
  if (!uid || !studentId) return res.status(400).json({ error: 'uid and studentId required' });

  const student = await db.prepare('SELECT id, name FROM students WHERE id = ?').get(studentId);
  if (!student) return res.status(404).json({ error: 'Student not found' });

  const result = await registerCard(uid, studentId);
  if (result.error) return res.status(409).json(result);

  res.json({ message: `Card ${result.uid} linked to ${student.name}`, cardId: result.cardId });
});

// PATCH /nfc/cards/:id/toggle — activate or deactivate a card
router.patch('/cards/:id/toggle', authMiddleware, shopOwnerMiddleware, async (req, res) => {
  const card = await db.prepare('SELECT * FROM cards WHERE id = ?').get(req.params.id);
  if (!card) return res.status(404).json({ error: 'Card not found' });

  const newState = card.active === 1 ? 0 : 1;
  await db.prepare('UPDATE cards SET active = ? WHERE id = ?').run(newState, req.params.id);
  res.json({ active: newState, message: newState ? 'Card activated' : 'Card deactivated' });
});

// DELETE /nfc/cards/:id — remove a card permanently
router.delete('/cards/:id', authMiddleware, shopOwnerMiddleware, async (req, res) => {
  await db.prepare('DELETE FROM cards WHERE id = ?').run(req.params.id);
  res.json({ message: 'Card removed' });
});

module.exports = router;
