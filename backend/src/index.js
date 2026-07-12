import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { dbMiddleware } from './middleware/db.js';
import { rateLimiter } from './middleware/rateLimit.js';

import authRoutes from './routes/auth.js';
import walletRoutes from './routes/wallet.js';
import nfcRoutes from './routes/nfc.js';
import shopRoutes from './routes/shop.js';
import studentsRoutes from './routes/students.js';
import parentRoutes from './routes/parent.js';
import insightsRoutes from './routes/insights.js';
import menuRoutes from './routes/menu.js';
import adminRoutes from './routes/admin.js';

const app = new Hono();

app.use('*', secureHeaders());
app.use('*', async (c, next) => {
  const cors_ = cors({
    origin: c.env.ALLOWED_ORIGINS ? c.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()) : '*',
    credentials: true,
  });
  return cors_(c, next);
});

// Registered before dbMiddleware/rate limiters below (Hono composes the
// chain in registration order) so a health check never pays for a Pool
// connection or a rate-limit binding call.
app.get('/health', (c) => c.json({ status: 'ok', app: 'StudPay API' }));

app.use('*', dbMiddleware);

// Tighter limit on PIN-guarded endpoints (login, change-pin, cashier PIN
// entry). This is IP-level defense in depth; the real brute-force stop is
// the per-account lockout in services/pinAuth.js, which still applies even
// if an attacker spreads attempts across many IPs.
app.use('/auth/login', rateLimiter('RATE_LIMITER_PIN'));
app.use('/auth/change-pin', rateLimiter('RATE_LIMITER_PIN'));
app.use('/wallet/pay-by-nfc', rateLimiter('RATE_LIMITER_PIN'));
app.use('/admin/students/:id/reset-pin', rateLimiter('RATE_LIMITER_PIN'));

// Generous global ceiling on everything else — mainly anti-abuse/anti-scraping.
app.use('*', rateLimiter('RATE_LIMITER_GLOBAL'));

app.route('/auth', authRoutes);
app.route('/wallet', walletRoutes);
app.route('/nfc', nfcRoutes);
app.route('/shop', shopRoutes);
app.route('/students', studentsRoutes);
app.route('/parent', parentRoutes);
app.route('/api/insights', insightsRoutes);
app.route('/menu', menuRoutes);
app.route('/admin', adminRoutes);

app.notFound((c) => c.json({ error: 'Route not found' }, 404));

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: 'Internal server error' }, 500);
});

export default app;
