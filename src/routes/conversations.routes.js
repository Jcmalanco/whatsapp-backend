const express = require('express');
const pool = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
const { auditLog } = require('../utils/audit');

const router = express.Router();

router.use(requireAuth);

router.get('/', asyncHandler(async (req, res) => {
  const status = req.query.status || 'open';
  const assignedToMe = req.query.assignedToMe === 'true';
  const params = [status];
  let assignedFilter = '';

  if (assignedToMe) {
    assignedFilter = 'AND c.assigned_user_id = ?';
    params.push(req.user.id);
  }

  const [rows] = await pool.execute(
    `SELECT c.*, ct.phone, ct.profile_name, u.name AS assigned_user_name
     FROM conversations c
     JOIN contacts ct ON ct.id = c.contact_id
     LEFT JOIN users u ON u.id = c.assigned_user_id
     WHERE c.status = ? ${assignedFilter}
     ORDER BY c.last_message_at DESC, c.id DESC`,
    params
  );
  res.json({ conversations: rows });
}));

router.get('/:id/messages', asyncHandler(async (req, res) => {
  const [rows] = await pool.execute(
    `SELECT m.*, u.name AS sent_by_user_name
     FROM messages m
     LEFT JOIN users u ON u.id = m.sent_by_user_id
     WHERE m.conversation_id = ?
     ORDER BY m.message_at ASC, m.id ASC`,
    [req.params.id]
  );
  res.json({ messages: rows });
}));

router.patch('/:id/assign', asyncHandler(async (req, res) => {
  const { userId } = req.body;
  if (!userId) throw new HttpError(400, 'userId requerido');

  await pool.execute('UPDATE conversations SET assigned_user_id = ? WHERE id = ?', [userId, req.params.id]);
  await auditLog(req, 'assign_conversation', 'conversation', req.params.id, { userId });
  res.json({ ok: true });
}));

router.patch('/:id/status', asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!['open', 'pending', 'resolved'].includes(status)) {
    throw new HttpError(400, 'Estatus invalido');
  }
  await pool.execute("UPDATE conversations SET status = ? WHERE id = ? AND status <> 'archived'", [status, req.params.id]);
  await auditLog(req, 'update_conversation_status', 'conversation', req.params.id, { status });
  res.json({ ok: true });
}));

router.patch('/:id/archive', requireRole('admin'), asyncHandler(async (req, res) => {
  await pool.execute(
    "UPDATE conversations SET status = 'archived', archived_at = NOW(), archived_by = ? WHERE id = ?",
    [req.user.id, req.params.id]
  );
  await auditLog(req, 'archive_conversation', 'conversation', req.params.id);
  res.json({ ok: true });
}));

module.exports = router;
