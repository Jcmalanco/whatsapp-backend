const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const env = require('./config/env');
const errorHandler = require('./middleware/errorHandler');

const app = express();

app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (!origin || env.corsOrigins.includes('*') || env.corsOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`CORS origin not allowed: ${origin}`));
  },
  credentials: true
}));
app.use(rateLimit({ windowMs: 60 * 1000, max: 300 }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/health', (req, res) => res.json({ ok: true }));

app.get('/health/db', async (req, res, next) => {
  try {
    const db = require('./config/db');
    const [rows] = await db.execute('SELECT NOW() AS now');
    res.json({ ok: true, dbTime: rows[0].now });
  } catch (error) {
    next(error);
  }
});

app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/profile', require('./routes/profile.routes'));
app.use('/api/users', require('./routes/users.routes'));
app.use('/api/conversations', require('./routes/conversations.routes'));
app.use('/api/messages', require('./routes/messages.routes'));
app.use('/api/broadcasts', require('./routes/broadcasts.routes'));
app.use('/api/audit-logs', require('./routes/audit.routes'));
app.use('/api/baileys', require('./routes/baileys.routes'));

app.use(errorHandler);

module.exports = app;
