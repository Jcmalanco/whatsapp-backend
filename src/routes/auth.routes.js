const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const env = require('../config/env');
const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');
const { requireAuth } = require('../middleware/auth');
const { auditLog } = require('../utils/audit');

const router = express.Router();

router.post('/login', asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        throw new HttpError(400, 'Email y password son requeridos');
    }

    const result = await pool.query(
        'SELECT * FROM users WHERE email = $1 LIMIT 1',
        [email]
    );

    const user = result.rows[0];

    if (!user || user.status !== 'active') {
        throw new HttpError(401, 'Credenciales invalidas');
    }

    const ok = await bcrypt.compare(password, user.password_hash);

    if (!ok) {
        throw new HttpError(401, 'Credenciales invalidas');
    }

    const token = jwt.sign(
        {
            sub: user.id,
            role: user.role
        },
        env.jwtSecret,
        {
            expiresIn: env.jwtExpiresIn
        }
    );

    req.user = user;

    await auditLog(req, 'login', 'user', user.id);

    res.json({
        token,
        user: {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role
        }
    });
}));

router.get('/me', requireAuth, asyncHandler(async (req, res) => {
  res.json({ user: req.user });
}));

module.exports = router;
