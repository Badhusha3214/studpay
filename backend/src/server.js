require('dotenv').config();
require('express-async-errors');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { initDB } = require('./db/schema');

const authRoutes     = require('./routes/auth');
const walletRoutes   = require('./routes/wallet');
const nfcRoutes      = require('./routes/nfc');
const shopRoutes     = require('./routes/shop');
const studentsRoutes = require('./routes/students');
const parentRoutes   = require('./routes/parent');
const insightsRoutes = require('./routes/insights');
const menuRoutes     = require('./routes/menu');
const adminRoutes    = require('./routes/admin');

const app = express();

// Render (and most PaaS) sit behind a reverse proxy — trust one hop of
// X-Forwarded-For so req.ip (and therefore rate limiting) reflects the
// real client instead of the proxy's address.
app.set('trust proxy', 1);

app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
    : true,
  credentials: true,
}));
app.use(express.json());

// Generous global ceiling — mainly anti-abuse/anti-scraping, not the primary defense.
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
}));

// Tighter limit on PIN-guarded endpoints (login, change-pin, cashier PIN
// entry). This is IP-level defense in depth; the real brute-force stop is
// the per-account lockout in services/pinAuth.js, which still applies even
// if an attacker spreads attempts across many IPs.
const pinLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Try again later.' },
});

// Health check
app.get('/health', (_, res) => res.json({ status: 'ok', app: 'StudPay API' }));

// Routes
app.use('/auth/login', pinLimiter);
app.use('/auth/change-pin', pinLimiter);
app.use('/wallet/pay-by-nfc', pinLimiter);
app.use('/admin/students/:id/reset-pin', pinLimiter);

app.use('/auth',     authRoutes);
app.use('/wallet',   walletRoutes);
app.use('/nfc',      nfcRoutes);
app.use('/shop',     shopRoutes);
app.use('/students', studentsRoutes);
app.use('/parent',   parentRoutes);
app.use('/api/insights', insightsRoutes);
app.use('/menu',     menuRoutes);
app.use('/admin',    adminRoutes);

// 404 handler
app.use((req, res) => res.status(404).json({ error: 'Route not found' }));

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3000;

initDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`🎓 StudPay API running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to initialize database', err);
    process.exit(1);
  });
