import { Hono } from 'hono';
import { sign } from 'hono/jwt';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { isLocked, lockedResponse, recordFailedAttempt, recordSuccess } from '../services/pinAuth.js';
import { createShopOwnerAccount, assertEmailFree } from '../services/accounts.js';
import { EMAIL_RE, PIN_RE } from '../utils/validate.js';
import { HttpError } from '../utils/errors.js';

const app = new Hono();

// Parses a jsonwebtoken-style duration string ("7d", "24h", "3600s") or a
// bare number of seconds — JWT_EXPIRES_IN keeps the same format it had under
// jsonwebtoken, just interpreted here since hono/jwt wants a numeric `exp`
// claim (seconds since epoch) instead of a duration option.
function durationSeconds(value) {
  const match = String(value).match(/^(\d+)\s*([smhd])?$/i);
  if (!match) return 7 * 24 * 60 * 60; // fall back to 7 days
  const n = Number(match[1]);
  const unit = (match[2] || 's').toLowerCase();
  const multiplier = { s: 1, m: 60, h: 3600, d: 86400 }[unit];
  return n * multiplier;
}

async function signToken(env, student) {
  const exp = Math.floor(Date.now() / 1000) + durationSeconds(env.JWT_EXPIRES_IN);
  return sign({ id: student.id, role: student.role, name: student.name, exp }, env.JWT_SECRET, 'HS256');
}

// POST /auth/register — self-service sign-up for parents and shop owners.
// Students are intentionally excluded: they're only created by a parent (linked
// by surname) or a shop owner, never via public registration.
app.post('/register', async (c) => {
  const db = c.get('db');
  const body = await c.req.json();
  const { name, email, pin, role, phone, merchantName } = body;

  if (!name || !email || !pin || !role) {
    return c.json({ error: 'name, email, pin and role are required' }, 400);
  }
  if (!['parent', 'shop_owner'].includes(role)) {
    return c.json({ error: 'role must be parent or shop_owner' }, 400);
  }

  try {
    let student;
    if (role === 'shop_owner') {
      student = await createShopOwnerAccount(db, { name, email, pin, merchantName, phone });
    } else {
      if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Enter a valid email address');
      if (!PIN_RE.test(String(pin))) throw new HttpError(400, 'PIN must be 4-6 digits');
      await assertEmailFree(db, email);

      const id      = 'parent-' + uuidv4().slice(0, 8);
      const pinHash = bcrypt.hashSync(String(pin), 10);

      await db.prepare(`
        INSERT INTO students (id, name, email, class, balance, pin_hash, role, phone)
        VALUES (?, ?, ?, 'Parent', 0, ?, 'parent', ?)
      `).run(id, name, email, pinHash, phone || null);

      student = { id, name, email, class: 'Parent', balance: 0, role: 'parent', phone: phone || null };
    }

    return c.json({ token: await signToken(c.env, student), student }, 201);
  } catch (err) {
    if (err instanceof HttpError) return c.json(err.body, err.status);
    throw err;
  }
});

// POST /auth/login  — email + PIN
app.post('/login', async (c) => {
  const db = c.get('db');
  const { email, pin } = await c.req.json();
  if (!email || !pin) return c.json({ error: 'Email and PIN required' }, 400);

  const student = await db.prepare('SELECT * FROM students WHERE email = ?').get(email);
  if (!student) return c.json({ error: 'Invalid credentials' }, 401);
  if (!student.active) return c.json({ error: 'This account has been deactivated' }, 401);

  if (isLocked(student)) {
    const { status, body } = lockedResponse(student);
    return c.json(body, status);
  }

  const valid = bcrypt.compareSync(String(pin), student.pin_hash);
  if (!valid) {
    await recordFailedAttempt(db, student.id);
    return c.json({ error: 'Invalid credentials' }, 401);
  }
  await recordSuccess(db, student.id);

  return c.json({
    token: await signToken(c.env, student),
    student: {
      id: student.id,
      name: student.name,
      email: student.email,
      class: student.class,
      balance: student.balance,
      role: student.role,
      merchant_name: student.merchant_name,
    },
  });
});

// POST /auth/change-pin
app.post('/change-pin', async (c) => {
  const db = c.get('db');
  const { email, oldPin, newPin } = await c.req.json();
  if (!PIN_RE.test(String(newPin))) {
    return c.json({ error: 'New PIN must be 4-6 digits' }, 400);
  }

  const student = await db.prepare('SELECT * FROM students WHERE email = ?').get(email);
  if (!student) return c.json({ error: 'Invalid credentials' }, 401);

  if (isLocked(student)) {
    const { status, body } = lockedResponse(student);
    return c.json(body, status);
  }

  if (!bcrypt.compareSync(String(oldPin), student.pin_hash)) {
    await recordFailedAttempt(db, student.id);
    return c.json({ error: 'Invalid credentials' }, 401);
  }
  await recordSuccess(db, student.id);

  const newHash = bcrypt.hashSync(String(newPin), 10);
  await db.prepare('UPDATE students SET pin_hash = ? WHERE id = ?').run(newHash, student.id);
  return c.json({ message: 'PIN updated successfully' });
});

export default app;
