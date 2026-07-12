import { Hono } from 'hono';
import { authMiddleware, shopOwnerMiddleware, staffMiddleware } from '../middleware/auth.js';
import { registerCard } from '../services/cards.js';

const app = new Hono();

// GET /nfc/cards — list all NFC cards with student info
app.get('/cards', authMiddleware, staffMiddleware, async (c) => {
  const db = c.get('db');
  const cards = await db.prepare(`
    SELECT c.id, c.uid, c.active, c.linked_at,
           s.id AS student_id, s.name, s.class, s.email, s.balance
    FROM cards c
    JOIN students s ON c.student_id = s.id
    ORDER BY c.linked_at DESC
  `).all();
  return c.json(cards);
});

// GET /nfc/cards/:uid — get a single card by UID
app.get('/cards/:uid', authMiddleware, staffMiddleware, async (c) => {
  const db = c.get('db');
  const card = await db.prepare(`
    SELECT c.id, c.uid, c.active, c.linked_at,
           s.id AS student_id, s.name, s.class, s.email, s.balance
    FROM cards c JOIN students s ON c.student_id = s.id
    WHERE c.uid = ?
  `).get(c.req.param('uid').toUpperCase());
  if (!card) return c.json({ error: 'Card not found' }, 404);

  const txns = await db.prepare(
    'SELECT * FROM transactions WHERE student_id = ? ORDER BY created_at DESC LIMIT 20'
  ).all(card.student_id);

  return c.json({ ...card, recentTransactions: txns });
});

// POST /nfc/lookup — find student by NFC UID (merchant terminal)
app.post('/lookup', authMiddleware, shopOwnerMiddleware, async (c) => {
  const db = c.get('db');
  const { uid } = await c.req.json();
  if (!uid) return c.json({ error: 'NFC UID required' }, 400);

  const card = await db.prepare('SELECT * FROM cards WHERE uid = ? AND active = 1').get(uid.toUpperCase());
  if (!card) return c.json({ error: 'Card not registered or inactive' }, 404);

  const student = await db.prepare(
    'SELECT id, name, email, class, balance, allergies FROM students WHERE id = ?'
  ).get(card.student_id);

  return c.json({ card, student });
});

// POST /nfc/register — link an NFC card UID to a student
app.post('/register', authMiddleware, shopOwnerMiddleware, async (c) => {
  const db = c.get('db');
  const { uid, studentId } = await c.req.json();
  if (!uid || !studentId) return c.json({ error: 'uid and studentId required' }, 400);

  const student = await db.prepare('SELECT id, name FROM students WHERE id = ?').get(studentId);
  if (!student) return c.json({ error: 'Student not found' }, 404);

  const result = await registerCard(db, uid, studentId);
  if (result.error) return c.json(result, 409);

  return c.json({ message: `Card ${result.uid} linked to ${student.name}`, cardId: result.cardId });
});

// PATCH /nfc/cards/:id/toggle — activate or deactivate a card
app.patch('/cards/:id/toggle', authMiddleware, staffMiddleware, async (c) => {
  const db = c.get('db');
  const id = c.req.param('id');
  const card = await db.prepare('SELECT * FROM cards WHERE id = ?').get(id);
  if (!card) return c.json({ error: 'Card not found' }, 404);

  const newState = card.active === 1 ? 0 : 1;
  await db.prepare('UPDATE cards SET active = ? WHERE id = ?').run(newState, id);
  return c.json({ active: newState, message: newState ? 'Card activated' : 'Card deactivated' });
});

// DELETE /nfc/cards/:id — remove a card permanently
app.delete('/cards/:id', authMiddleware, shopOwnerMiddleware, async (c) => {
  const db = c.get('db');
  await db.prepare('DELETE FROM cards WHERE id = ?').run(c.req.param('id'));
  return c.json({ message: 'Card removed' });
});

export default app;
