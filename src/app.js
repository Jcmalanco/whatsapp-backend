const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const env = require('./config/env');
const errorHandler = require('./middleware/errorHandler');

const app = express();

app.use(helmet());
app.use(cors({ origin: env.corsOrigin === '*' ? true : env.corsOrigin, credentials: true }));
app.use(rateLimit({ windowMs: 60 * 1000, max: 300 }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/health', (req, res) => res.json({ ok: true }));

app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/users', require('./routes/users.routes'));
app.use('/api/conversations', require('./routes/conversations.routes'));
app.use('/api/messages', require('./routes/messages.routes'));
app.use('/api/broadcasts', require('./routes/broadcasts.routes'));
app.use('/api/audit-logs', require('./routes/audit.routes'));
app.use('/api/webhooks', require('./routes/webhooks.routes'));

app.use(errorHandler);

module.exports = app;
