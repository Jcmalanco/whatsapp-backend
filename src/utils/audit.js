const pool = require('../config/db');

async function auditLog(req, action, entityType, entityId, metadata = {}) {
  const userId = req.user ? req.user.id : null;
  await pool.execute(
    `INSERT INTO audit_logs
      (user_id, action, entity_type, entity_id, metadata, ip_address, user_agent)
     VALUES (?, ?, ?, ?, ?::jsonb, ?, ?)`,
    [
      userId,
      action,
      entityType,
      entityId || null,
      JSON.stringify(metadata),
      req.ip || null,
      req.get('user-agent') || null
    ]
  );
}

module.exports = { auditLog };
