const express = require('express');
const pool = require('../config/db');
const whatsapp = require('../services/whatsappService');
const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
const { auditLog } = require('../utils/audit');

const router = express.Router();

router.use(requireAuth, requireRole('admin', 'supervisor'));

router.post('/', asyncHandler(async (req, res) => {
  const { contactIds, type, body, mediaUrl, caption } = req.body;
  if (!Array.isArray(contactIds) || contactIds.length === 0) throw new HttpError(400, 'contactIds requerido');
  if (!['text', 'image', 'video', 'document'].includes(type)) throw new HttpError(400, 'Tipo invalido');

  const [broadcast] = await pool.execute(
    `INSERT INTO broadcasts (created_by, type, body, media_url, total_recipients, status)
     VALUES (?, ?, ?, ?, ?, 'sending')
     RETURNING id`,
    [req.user.id, type, body || caption || null, mediaUrl || null, contactIds.length]
  );
  const broadcastId = broadcast[0].id;

  const [contacts] = await pool.query('SELECT id, phone FROM contacts WHERE id = ANY(?::bigint[])', [contactIds]);

  let sentCount = 0;
  let failedCount = 0;
  for (const contact of contacts) {
    const [recipient] = await pool.execute(
      'INSERT INTO broadcast_recipients (broadcast_id, contact_id) VALUES (?, ?) RETURNING id',
      [broadcastId, contact.id]
    );
    const recipientId = recipient[0].id;

    try {
      const sent = type === 'text'
        ? await whatsapp.sendText(contact.phone, body)
        : await whatsapp.sendMedia(contact.phone, type, mediaUrl, caption);
      const waMessageId = sent.messages && sent.messages[0] ? sent.messages[0].id : null;

      await pool.execute(
        "UPDATE broadcast_recipients SET status = 'sent', whatsapp_message_id = ?, sent_at = NOW() WHERE id = ?",
        [waMessageId, recipientId]
      );
      sentCount += 1;
    } catch (error) {
      failedCount += 1;
      await pool.execute(
        "UPDATE broadcast_recipients SET status = 'failed', error_message = ? WHERE id = ?",
        [error.message, recipientId]
      );
    }
  }

  await pool.execute(
    `UPDATE broadcasts
     SET status = ?, sent_count = ?, failed_count = ?
     WHERE id = ?`,
    [failedCount > 0 ? 'failed' : 'completed', sentCount, failedCount, broadcastId]
  );
  await auditLog(req, 'create_broadcast', 'broadcast', broadcastId, {
    total: contactIds.length,
    sentCount,
    failedCount
  });

  res.status(201).json({ id: broadcastId, sentCount, failedCount });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const [broadcasts] = await pool.execute('SELECT * FROM broadcasts WHERE id = ?', [req.params.id]);
  const [recipients] = await pool.execute(
    `SELECT br.*, c.phone, c.profile_name
     FROM broadcast_recipients br
     JOIN contacts c ON c.id = br.contact_id
     WHERE br.broadcast_id = ?`,
    [req.params.id]
  );
  res.json({ broadcast: broadcasts[0], recipients });
}));

module.exports = router;
