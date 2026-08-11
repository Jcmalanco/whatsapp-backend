const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
const { auditLog } = require('../utils/audit');

const router = express.Router();

router.use(requireAuth, requireRole('admin'));

router.get('/', asyncHandler(async (req, res) => {
  const [rows] = await pool.execute(
    `SELECT
       u.id,
       u.name,
       u.email,
       u.role,
       u.status,
       u.created_at,
       p.display_name,
       p.phone,
       p.job_title,
       p.department,
       p.avatar_url,
       p.bio
     FROM users u
     LEFT JOIN user_profiles p ON p.user_id = u.id
     ORDER BY u.name`
  );
  res.json({ users: rows });
}));

router.post('/', asyncHandler(async (req, res) => {
  const {
    name,
    email,
    password,
    role = 'agent',
    phone,
    jobTitle,
    department,
    bio
  } = req.body;
  if (!name || !email || !password) throw new HttpError(400, 'Datos incompletos');

  const passwordHash = await bcrypt.hash(password, 12);
  const [result] = await pool.execute(
    'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?) RETURNING id',
    [name, email, passwordHash, role]
  );
  const userId = result[0].id;
  await pool.execute(
    `INSERT INTO user_profiles
      (user_id, display_name, phone, job_title, department, bio)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [userId, name, phone || null, jobTitle || null, department || null, bio || null]
  );
  await auditLog(req, 'create_user', 'user', userId, { email, role });
  res.status(201).json({ id: userId });
}));

router.patch('/:id/status', asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!['active', 'disabled'].includes(status)) throw new HttpError(400, 'Estatus invalido');

  await pool.execute('UPDATE users SET status = ? WHERE id = ?', [status, req.params.id]);
  await auditLog(req, 'update_user_status', 'user', req.params.id, { status });
  res.json({ ok: true });
}));

module.exports = router;
