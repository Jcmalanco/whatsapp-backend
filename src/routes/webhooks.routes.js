const express = require('express');
const env = require('../config/env');
const pool = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const whatsapp = require('../services/whatsappService');
const { saveBuffer } = require('../services/mediaStorage');
const {
  upsertContact,
  getOrCreateConversation,
  touchConversation
} = require('../services/conversationService');

const router = express.Router();

router.get('/whatsapp', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === env.whatsapp.verifyToken) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

router.post('/whatsapp', asyncHandler(async (req, res) => {
  const entries = req.body.entry || [];

  for (const entry of entries) {
    for (const change of entry.changes || []) {
      const value = change.value || {};
      await handleStatuses(value.statuses || []);
      await handleMessages(value.contacts || [], value.messages || []);
    }
  }

  res.sendStatus(200);
}));

async function handleStatuses(statuses) {
  for (const status of statuses) {
    const messageId = status.id;
    const eventAt = new Date(Number(status.timestamp || Date.now() / 1000) * 1000);

    const [messages] = await pool.execute(
      'SELECT id FROM messages WHERE whatsapp_message_id = ? LIMIT 1',
      [messageId]
    );
    const localMessageId = messages[0] ? messages[0].id : null;

    await pool.execute(
      `INSERT INTO message_status_events
        (message_id, whatsapp_message_id, status, payload, event_at)
       VALUES (?, ?, ?, ?::jsonb, ?)`,
      [localMessageId, messageId, status.status, JSON.stringify(status), eventAt]
    );

    if (localMessageId && ['sent', 'delivered', 'read', 'failed'].includes(status.status)) {
      await pool.execute('UPDATE messages SET whatsapp_status = ? WHERE id = ?', [status.status, localMessageId]);
    }
  }
}

async function handleMessages(contacts, messages) {
  const contactByWaId = new Map();
  for (const contact of contacts) {
    contactByWaId.set(contact.wa_id, contact);
  }

  for (const message of messages) {
    const profile = contactByWaId.get(message.from) || {};
    const contact = await upsertContact(message.from, message.from, profile.profile && profile.profile.name);
    const conversation = await getOrCreateConversation(contact.id);
    const messageAt = new Date(Number(message.timestamp || Date.now() / 1000) * 1000);
    const parsed = await parseInboundMessage(message);

    await pool.execute(
      `INSERT INTO messages
        (conversation_id, contact_id, direction, type, body, whatsapp_message_id,
         whatsapp_status, media_id, media_url, media_mime_type, media_sha256, message_at, original_payload)
       VALUES (?, ?, 'inbound', ?, ?, ?, 'received', ?, ?, ?, ?, ?, ?::jsonb)
       ON CONFLICT (whatsapp_message_id) DO NOTHING`,
      [
        conversation.id,
        contact.id,
        parsed.type,
        parsed.body,
        message.id,
        parsed.mediaId,
        parsed.mediaUrl,
        parsed.mimeType,
        parsed.sha256,
        messageAt,
        JSON.stringify(message)
      ]
    );

    await touchConversation(conversation.id, messageAt);
  }
}

async function parseInboundMessage(message) {
  if (message.type === 'text') {
    return {
      type: 'text',
      body: message.text && message.text.body,
      mediaId: null,
      mediaUrl: null,
      mimeType: null,
      sha256: null
    };
  }

  const mediaPayload = message[message.type];
  if (mediaPayload && ['image', 'video', 'document', 'audio', 'sticker'].includes(message.type)) {
    const media = await whatsapp.downloadMedia(mediaPayload.id);
    const extension = extensionFromMime(media.mimeType);
    const mediaUrl = await saveBuffer(media.buffer, `${mediaPayload.id}.${extension}`, media.mimeType);
    return {
      type: ['image', 'video', 'document', 'audio', 'sticker'].includes(message.type) ? message.type : 'unknown',
      body: mediaPayload.caption || mediaPayload.filename || null,
      mediaId: mediaPayload.id,
      mediaUrl,
      mimeType: media.mimeType,
      sha256: media.sha256
    };
  }

  return {
    type: message.type || 'unknown',
    body: null,
    mediaId: null,
    mediaUrl: null,
    mimeType: null,
    sha256: null
  };
}

function extensionFromMime(mimeType) {
  const map = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'video/mp4': 'mp4',
    'application/pdf': 'pdf',
    'audio/ogg': 'ogg'
  };
  return map[mimeType] || 'bin';
}

module.exports = router;
