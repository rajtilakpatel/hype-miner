require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { migrate, seed } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// Security & parsing
app.use(helmet({
  contentSecurityPolicy: false, // Telegram Mini Apps need flexible CSP
  crossOriginEmbedderPolicy: false
}));
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json({ limit: '1mb' }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, slow down' }
});
const mineLimiter = rateLimit({
  windowMs: 10 * 1000,
  max: 5,
  message: { error: 'Mining too fast' }
});

app.use('/api', apiLimiter);

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/mine', mineLimiter, require('./routes/mine'));
app.use('/api/tasks', require('./routes/tasks'));
app.use('/api/referral', require('./routes/referral'));
app.use('/api/profile', require('./routes/profile'));
app.use('/api/wallet', require('./routes/wallet'));
app.use('/api/swap', require('./routes/swap'));
app.use('/api/market', require('./routes/market'));
app.use('/api/admin', require('./routes/admin'));

// Health
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', app: 'HYPE MINER', time: new Date().toISOString() });
});

// Static frontend
app.use(express.static(path.join(__dirname, '..', 'public')));

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

// Boot
migrate();
seed();

app.listen(PORT, () => {
  console.log(`HYPE MINER server running on port ${PORT}`);
  console.log(`Open http://localhost:${PORT}`);
});
