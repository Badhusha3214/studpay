require('dotenv').config();
require('express-async-errors');
const express = require('express');
const cors = require('cors');
const { initDB } = require('./db/schema');

const authRoutes     = require('./routes/auth');
const walletRoutes   = require('./routes/wallet');
const nfcRoutes      = require('./routes/nfc');
const shopRoutes     = require('./routes/shop');
const studentsRoutes = require('./routes/students');
const parentRoutes   = require('./routes/parent');

const app = express();

app.use(cors({
  origin: process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',')
    : true,
  credentials: true,
}));
app.use(express.json());

// Health check
app.get('/health', (_, res) => res.json({ status: 'ok', app: 'StudPay API' }));

// Routes
app.use('/auth',     authRoutes);
app.use('/wallet',   walletRoutes);
app.use('/nfc',      nfcRoutes);
app.use('/shop',     shopRoutes);
app.use('/students', studentsRoutes);
app.use('/parent',   parentRoutes);

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
