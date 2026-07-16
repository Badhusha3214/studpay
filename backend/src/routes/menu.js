import { Hono } from 'hono';
import { v4 as uuidv4 } from 'uuid';
import { authMiddleware, shopOwnerMiddleware, shopStaffMiddleware } from '../middleware/auth.js';

const app = new Hono();

const CATEGORIES = ['junk', 'healthy', 'beverage', 'snack', 'meal', 'other'];

// GET /menu/items — list only the calling shop owner's own items (active + inactive)
app.get('/items', authMiddleware, shopStaffMiddleware, async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const items = await db
    .prepare('SELECT id, name, category, price, active FROM menu_items WHERE shop_owner_id = ? ORDER BY category, name')
    .all(user.id);
  return c.json(items);
});

// POST /menu/items — create a new item owned by the caller
app.post('/items', authMiddleware, shopOwnerMiddleware, async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const { name, category, price } = await c.req.json();
  if (!name || !category || price === undefined || price === null || Number(price) <= 0) {
    return c.json({ error: 'name, category and a positive price are required' }, 400);
  }
  if (!CATEGORIES.includes(category)) {
    return c.json({ error: `category must be one of: ${CATEGORIES.join(', ')}` }, 400);
  }

  const id = 'item-' + uuidv4().slice(0, 8);
  await db
    .prepare('INSERT INTO menu_items (id, name, category, price, active, shop_owner_id) VALUES (?, ?, ?, ?, 1, ?)')
    .run(id, name, category, Number(price), user.id);

  return c.json({ id, name, category, price: Number(price), active: 1 }, 201);
});

// PUT /menu/items/:id — edit name/category/price of the caller's own item
app.put('/items/:id', authMiddleware, shopOwnerMiddleware, async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const id = c.req.param('id');
  const existing = await db.prepare('SELECT * FROM menu_items WHERE id = ? AND shop_owner_id = ?').get(id, user.id);
  if (!existing) return c.json({ error: 'Menu item not found' }, 404);

  const { name, category, price } = await c.req.json();
  if (category && !CATEGORIES.includes(category)) {
    return c.json({ error: `category must be one of: ${CATEGORIES.join(', ')}` }, 400);
  }

  await db
    .prepare(
      `
    UPDATE menu_items SET
      name = COALESCE(?, name),
      category = COALESCE(?, category),
      price = COALESCE(?, price)
    WHERE id = ? AND shop_owner_id = ?
  `
    )
    .run(name || null, category || null, price != null ? Number(price) : null, id, user.id);

  return c.json({ message: 'Menu item updated' });
});

// PATCH /menu/items/:id/toggle — activate/deactivate the caller's own item
app.patch('/items/:id/toggle', authMiddleware, shopOwnerMiddleware, async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const id = c.req.param('id');
  const item = await db.prepare('SELECT * FROM menu_items WHERE id = ? AND shop_owner_id = ?').get(id, user.id);
  if (!item) return c.json({ error: 'Menu item not found' }, 404);

  const newState = item.active === 1 ? 0 : 1;
  await db.prepare('UPDATE menu_items SET active = ? WHERE id = ?').run(newState, id);
  return c.json({ active: newState, message: newState ? 'Item activated' : 'Item deactivated' });
});

export default app;
