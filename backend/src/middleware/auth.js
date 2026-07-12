import { verify } from 'hono/jwt';

export async function authMiddleware(c, next) {
  const header = c.req.header('Authorization');
  if (!header || !header.startsWith('Bearer ')) {
    return c.json({ error: 'No token provided' }, 401);
  }

  const token = header.slice('Bearer '.length);
  try {
    const payload = await verify(token, c.env.JWT_SECRET, 'HS256');
    c.set('user', payload);
    await next();
  } catch {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }
}

export async function shopOwnerMiddleware(c, next) {
  if (c.get('user')?.role !== 'shop_owner') {
    return c.json({ error: 'Shop owner access required' }, 403);
  }
  await next();
}

export async function parentMiddleware(c, next) {
  if (c.get('user')?.role !== 'parent') {
    return c.json({ error: 'Parent access required' }, 403);
  }
  await next();
}

export async function schoolAdminMiddleware(c, next) {
  if (c.get('user')?.role !== 'school_admin') {
    return c.json({ error: 'School admin access required' }, 403);
  }
  await next();
}

// Widened check for endpoints that are already school-wide in scope (no
// per-shop filter) and should be reachable by both a cashier and a school
// admin — e.g. viewing/searching the student roster, card management.
export async function staffMiddleware(c, next) {
  if (!['shop_owner', 'school_admin'].includes(c.get('user')?.role)) {
    return c.json({ error: 'Staff access required' }, 403);
  }
  await next();
}
