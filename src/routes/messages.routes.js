const express = require('express');
const multer = require('multer');
const pool = require('../config/db');
const whatsapp = require('../services/whatsappService');
const { saveUploadedFile } = require('../services/mediaStorage');
const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');
const { requireAuth } = require('../middleware/auth');
const { auditLog } = require('../utils/audit');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }
});

router.use(requireAuth);

async function getConversationWithContact(conversationId) {
  const [rows] = await pool.execute(
    `SELECT c.*, ct.id AS contact_id, ct.phone
     FROM conversations c
     JOIN contacts ct ON ct.id = c.contact_id
     WHERE c.id = ? AND c.status <> 'archived'
     LIMIT 1`,
    [conversationId]
  );
  return rows[0];
}

router.post('/text', asyncHandler(async (req, res) => {
  const { conversationId, body } = req.body;
  if (!conversationId || !body) throw new HttpError(400, 'conversationId y body son requeridos');

  const conversation = await getConversationWithContact(conversationId);
  if (!conversation) throw new HttpError(404, 'Conversacion no encontrada');

  const sent = await whatsapp.sendText(conversation.phone, body);
  const waMessageId = sent.messages && sent.messages[0] ? sent.messages[0].id : null;

  const [result] = await pool.execute(
    `INSERT INTO messages
      (conversation_id, contact_id, direction, type, body, whatsapp_message_id,
       whatsapp_status, sent_by_user_id, message_at, original_payload)
     VALUES (?, ?, 'outbound', 'text', ?, ?, 'sent', ?, NOW(), ?::jsonb)
     RETURNING id`,
    [conversationId, conversation.contact_id, body, waMessageId, req.user.id, JSON.stringify(sent)]
  );
  const messageId = result[0].id;
  await pool.execute('UPDATE conversations SET last_message_at = NOW() WHERE id = ?', [conversationId]);
  await auditLog(req, 'send_text_message', 'message', messageId, { conversationId });

  res.status(201).json({ id: messageId, whatsappMessageId: waMessageId });
}));

router.post('/media', upload.single('file'), asyncHandler(async (req, res) => {
  const { conversationId, type, caption } = req.body;
  if (!conversationId || !type || !req.file) throw new HttpError(400, 'conversationId, type y file son requeridos');
  if (!['image', 'video', 'document'].includes(type)) throw new HttpError(400, 'Tipo de media invalido');

  const conversation = await getConversationWithContact(conversationId);
  if (!conversation) throw new HttpError(404, 'Conversacion no encontrada');

  const mediaUrl = await saveUploadedFile(req.file);
  const sent = await whatsapp.sendMedia(conversation.phone, type, mediaUrl, caption, req.file.originalname);
  const waMessageId = sent.messages && sent.messages[0] ? sent.messages[0].id : null;

  const [result] = await pool.execute(
    `INSERT INTO messages
      (conversation_id, contact_id, direction, type, body, whatsapp_message_id,
       whatsapp_status, media_url, media_mime_type, sent_by_user_id, message_at, original_payload)
     VALUES (?, ?, 'outbound', ?, ?, ?, 'sent', ?, ?, ?, NOW(), ?::jsonb)
     RETURNING id`,
    [
      conversationId,
      conversation.contact_id,
      type,
      caption || null,
      waMessageId,
      mediaUrl,
      req.file.mimetype,
      req.user.id,
      JSON.stringify(sent)
    ]
  );
  const messageId = result[0].id;
  await pool.execute('UPDATE conversations SET last_message_at = NOW() WHERE id = ?', [conversationId]);
  await auditLog(req, 'send_media_message', 'message', messageId, {
    conversationId,
    type,
    filename: req.file.originalname
  });

  res.status(201).json({ id: messageId, whatsappMessageId: waMessageId, mediaUrl });
}));

module.exports = router;
