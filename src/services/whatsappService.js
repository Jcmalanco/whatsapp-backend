const crypto = require('crypto');
const env = require('../config/env');
const pool = require('../config/db');
const { saveBuffer } = require('./mediaStorage');
const {
  upsertContact,
  getOrCreateConversation,
  touchConversation
} = require('./conversationService');

let sock = null;
let connecting = null;
let baileys = null;
let logger = null;

const status = {
  connection: 'closed',
  qr: null,
  lastError: null,
  connectedAt: null,
  me: null
};

async function loadDeps() {
  if (!baileys) {
    baileys = await import('@whiskeysockets/baileys');
  }
  if (!logger) {
    const pino = (await import('pino')).default;
    logger = pino({ level: 'silent' });
  }
  return baileys;
}

async function start() {
  if (!env.baileys.enabled) return getStatus();
  if (sock || connecting) return connecting || getStatus();

  connecting = connect();
  try {
    await connecting;
  } finally {
    connecting = null;
  }
  return getStatus();
}

async function restart() {
  if (sock) {
    try {
      sock.end(new Error('Manual restart'));
    } catch (error) {
      console.error('Baileys restart error', error);
    }
  }
  sock = null;
  status.connection = 'restarting';
  return start();
}

async function connect() {
  const {
    default: makeWASocket,
    Browsers,
    DisconnectReason,
    getContentType,
    useMultiFileAuthState
  } = await loadDeps();

  const { state, saveCreds } = await useMultiFileAuthState(env.baileys.authDir);

  sock = makeWASocket({
    auth: state,
    browser: Browsers.ubuntu(env.baileys.browserName),
    logger,
    printQRInTerminal: env.baileys.printQrInTerminal
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) status.qr = qr;
    if (connection) status.connection = connection;

    if (connection === 'open') {
      status.qr = null;
      status.lastError = null;
      status.connectedAt = new Date().toISOString();
      status.me = sock.user || null;
      console.log('Baileys connected');
    }

    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      status.lastError = lastDisconnect?.error?.message || 'Connection closed';
      sock = null;

      if (code !== DisconnectReason.loggedOut) {
        setTimeout(() => {
          start().catch((error) => console.error('Baileys reconnect failed', error));
        }, env.baileys.reconnectMs);
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const message of messages) {
      try {
        if (!message.message || message.key.fromMe) continue;
        await persistInboundMessage(message, getContentType);
      } catch (error) {
        console.error('Baileys inbound message failed', error);
      }
    }
  });

  sock.ev.on('messages.update', async (updates) => {
    for (const item of updates) {
      try {
        await persistStatusUpdate(item);
      } catch (error) {
        console.error('Baileys status update failed', error);
      }
    }
  });
}

function getStatus() {
  return {
    enabled: env.baileys.enabled,
    connection: status.connection,
    qr: status.qr,
    lastError: status.lastError,
    connectedAt: status.connectedAt,
    me: status.me
  };
}

function ensureConnected() {
  if (!sock || status.connection !== 'open') {
    const error = new Error('Baileys no esta conectado. Escanea el QR primero.');
    error.status = 503;
    throw error;
  }
}

function toJid(to) {
  const value = String(to || '').trim();
  if (value.includes('@')) return value;
  return `${value.replace(/\D/g, '')}@s.whatsapp.net`;
}

async function sendText(to, body) {
  ensureConnected();
  const sent = await sock.sendMessage(toJid(to), { text: body });
  return { messages: [{ id: sent?.key?.id || crypto.randomUUID() }], raw: sent };
}

async function sendMedia(to, type, mediaUrl, caption, filename) {
  ensureConnected();
  const jid = toJid(to);
  const payload = { caption: caption || undefined };

  if (type === 'image') payload.image = { url: mediaUrl };
  if (type === 'video') payload.video = { url: mediaUrl };
  if (type === 'document') {
    payload.document = { url: mediaUrl };
    payload.fileName = filename || 'document';
    payload.mimetype = 'application/octet-stream';
  }

  const sent = await sock.sendMessage(jid, payload);
  return { messages: [{ id: sent?.key?.id || crypto.randomUUID() }], raw: sent };
}

async function persistInboundMessage(message, getContentType) {
  const remoteJid = message.key.remoteJid;
  if (!remoteJid || remoteJid === 'status@broadcast') return;

  const phone = remoteJid.split('@')[0];
  const contact = await upsertContact(remoteJid, phone, message.pushName || null);
  const conversation = await getOrCreateConversation(contact.id);
  const messageAt = new Date(Number(message.messageTimestamp || Date.now() / 1000) * 1000);
  const parsed = await parseBaileysMessage(message, getContentType);

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
      message.key.id,
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

async function parseBaileysMessage(message, getContentType) {
  const content = unwrapMessage(message.message);
  const contentType = getContentType(content) || 'unknown';

  if (content.conversation) {
    return parsedText(content.conversation);
  }
  if (content.extendedTextMessage?.text) {
    return parsedText(content.extendedTextMessage.text);
  }

  const map = {
    imageMessage: 'image',
    videoMessage: 'video',
    documentMessage: 'document',
    audioMessage: 'audio',
    stickerMessage: 'sticker'
  };
  const type = map[contentType] || 'unknown';
  const mediaPayload = content[contentType];

  if (mediaPayload && type !== 'unknown') {
    const { downloadMediaMessage } = await loadDeps();
    const buffer = await downloadMediaMessage(message, 'buffer', {}, { logger });
    const mimeType = mediaPayload.mimetype || 'application/octet-stream';
    const extension = extensionFromMime(mimeType);
    const mediaUrl = await saveBuffer(buffer, `${message.key.id}.${extension}`, mimeType);

    return {
      type,
      body: mediaPayload.caption || mediaPayload.fileName || null,
      mediaId: message.key.id,
      mediaUrl,
      mimeType,
      sha256: mediaPayload.fileSha256 ? Buffer.from(mediaPayload.fileSha256).toString('hex') : null
    };
  }

  return {
    type,
    body: null,
    mediaId: null,
    mediaUrl: null,
    mimeType: null,
    sha256: null
  };
}

function parsedText(body) {
  return {
    type: 'text',
    body,
    mediaId: null,
    mediaUrl: null,
    mimeType: null,
    sha256: null
  };
}

function unwrapMessage(message) {
  return message?.ephemeralMessage?.message
    || message?.viewOnceMessage?.message
    || message?.viewOnceMessageV2?.message
    || message
    || {};
}

async function persistStatusUpdate(item) {
  const messageId = item.key?.id;
  if (!messageId) return;

  const statusName = mapBaileysStatus(item.update?.status);
  if (!statusName) return;

  const [messages] = await pool.execute(
    'SELECT id FROM messages WHERE whatsapp_message_id = ? LIMIT 1',
    [messageId]
  );
  const localMessageId = messages[0] ? messages[0].id : null;

  await pool.execute(
    `INSERT INTO message_status_events
      (message_id, whatsapp_message_id, status, payload, event_at)
     VALUES (?, ?, ?, ?::jsonb, NOW())`,
    [localMessageId, messageId, statusName, JSON.stringify(item)]
  );

  if (localMessageId) {
    await pool.execute('UPDATE messages SET whatsapp_status = ? WHERE id = ?', [statusName, localMessageId]);
  }
}

function mapBaileysStatus(value) {
  const map = {
    1: 'sent',
    2: 'delivered',
    3: 'read',
    4: 'read',
    5: 'failed'
  };
  return map[value] || null;
}

function extensionFromMime(mimeType) {
  const map = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'video/mp4': 'mp4',
    'application/pdf': 'pdf',
    'audio/ogg': 'ogg'
  };
  return map[mimeType] || 'bin';
}

module.exports = { start, restart, getStatus, sendText, sendMedia };
