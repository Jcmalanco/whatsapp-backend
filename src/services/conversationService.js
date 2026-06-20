const pool = require('../config/db');

async function upsertContact(waId, phone, profileName) {
  await pool.execute(
    `INSERT INTO contacts (wa_id, phone, profile_name)
     VALUES (?, ?, ?)
     ON CONFLICT (wa_id)
     DO UPDATE SET phone = EXCLUDED.phone, profile_name = EXCLUDED.profile_name`,
    [waId, phone, profileName || null]
  );
  const [rows] = await pool.execute('SELECT * FROM contacts WHERE wa_id = ? LIMIT 1', [waId]);
  return rows[0];
}

async function getOrCreateConversation(contactId) {
  const [existing] = await pool.execute(
    `SELECT * FROM conversations
     WHERE contact_id = ? AND status <> 'archived'
     ORDER BY id DESC LIMIT 1`,
    [contactId]
  );
  if (existing[0]) return existing[0];

  const [result] = await pool.execute(
    "INSERT INTO conversations (contact_id, status) VALUES (?, 'open') RETURNING id",
    [contactId]
  );
  const [rows] = await pool.execute('SELECT * FROM conversations WHERE id = ?', [result[0].id]);
  return rows[0];
}

async function touchConversation(conversationId, messageAt) {
  await pool.execute(
    "UPDATE conversations SET last_message_at = ?, status = CASE WHEN status = 'archived' THEN status ELSE 'open' END WHERE id = ?",
    [messageAt, conversationId]
  );
}

module.exports = { upsertContact, getOrCreateConversation, touchConversation };
