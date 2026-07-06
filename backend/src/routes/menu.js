const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const { db } = require('../db/schema');
const { authMiddleware, shopOwnerMiddleware } = require('../middleware/auth');

const CATEGORIES = ['junk', 'healthy', 'beverage', 'snack', 'meal', 'other'];

// GET /menu/items — list only the calling shop owner's own items (active + inactive)
router.get('/items', authMiddleware, shopOwnerMiddleware, async (req, res) => {
  const items = await db.prepare(
    'SELECT id, name, category, price, active FROM menu_items WHERE shop_owner_id = ? ORDER BY category, name'
  ).all(req.user.id);
  res.json(items);
});

// POST /menu/items — create a new item owned by the caller
router.post('/items', authMiddleware, shopOwnerMiddleware, async (req, res) => {
  const { name, category, price } = req.body;
  if (!name || !category || price === undefined || price === null || Number(price) <= 0) {
    return res.status(400).json({ error: 'name, category and a positive price are required' });
  }
  if (!CATEGORIES.includes(category)) {
    return res.status(400).json({ error: `category must be one of: ${CATEGORIES.join(', ')}` });
  }

  const id = 'item-' + uuidv4().slice(0, 8);
  await db.prepare(
    'INSERT INTO menu_items (id, name, category, price, active, shop_owner_id) VALUES (?, ?, ?, ?, 1, ?)'
  ).run(id, name, category, Number(price), req.user.id);

  res.status(201).json({ id, name, category, price: Number(price), active: 1 });
});

// PUT /menu/items/:id — edit name/category/price of the caller's own item
router.put('/items/:id', authMiddleware, shopOwnerMiddleware, async (req, res) => {
  const existing = await db.prepare(
    'SELECT * FROM menu_items WHERE id = ? AND shop_owner_id = ?'
  ).get(req.params.id, req.user.id);
  if (!existing) return res.status(404).json({ error: 'Menu item not found' });

  const { name, category, price } = req.body;
  if (category && !CATEGORIES.includes(category)) {
    return res.status(400).json({ error: `category must be one of: ${CATEGORIES.join(', ')}` });
  }

  await db.prepare(`
    UPDATE menu_items SET
      name = COALESCE(?, name),
      category = COALESCE(?, category),
      price = COALESCE(?, price)
    WHERE id = ? AND shop_owner_id = ?
  `).run(name || null, category || null, price != null ? Number(price) : null, req.params.id, req.user.id);

  res.json({ message: 'Menu item updated' });
});

// PATCH /menu/items/:id/toggle — activate/deactivate the caller's own item
router.patch('/items/:id/toggle', authMiddleware, shopOwnerMiddleware, async (req, res) => {
  const item = await db.prepare(
    'SELECT * FROM menu_items WHERE id = ? AND shop_owner_id = ?'
  ).get(req.params.id, req.user.id);
  if (!item) return res.status(404).json({ error: 'Menu item not found' });

  const newState = item.active === 1 ? 0 : 1;
  await db.prepare('UPDATE menu_items SET active = ? WHERE id = ?').run(newState, req.params.id);
  res.json({ active: newState, message: newState ? 'Item activated' : 'Item deactivated' });
});

module.exports = router;
