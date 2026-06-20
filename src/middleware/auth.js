const jwt = require('jsonwebtoken');
const env = require('../config/env');
const pool = require('../config/db');
const HttpError = require('../utils/httpError');

async function requireAuth(req, res, next) {
  try {
    const header = req.get('authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw new HttpError(401, 'Token requerido');

    const payload = jwt.verify(token, env.jwtSecret);
    const [rows] = await pool.execute(
      'SELECT id, name, email, role, status FROM users WHERE id = ? LIMIT 1',
      [payload.sub]
    );

    const user = rows[0];
    if (!user || user.status !== 'active') throw new HttpError(401, 'Usuario no autorizado');

    req.user = user;
    next();
  } catch (error) {
    next(error.status ? error : new HttpError(401, 'Token invalido'));
  }
}

module.exports = { requireAuth };
