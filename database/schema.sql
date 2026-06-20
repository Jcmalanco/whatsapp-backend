CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(30) NOT NULL DEFAULT 'agent' CHECK (role IN ('admin', 'supervisor', 'agent')),
  status VARCHAR(30) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contacts (
  id BIGSERIAL PRIMARY KEY,
  wa_id VARCHAR(64) NOT NULL UNIQUE,
  phone VARCHAR(40) NOT NULL,
  profile_name VARCHAR(190),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS conversations (
  id BIGSERIAL PRIMARY KEY,
  contact_id BIGINT NOT NULL REFERENCES contacts(id),
  assigned_user_id BIGINT REFERENCES users(id),
  status VARCHAR(30) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'pending', 'resolved', 'archived')),
  last_message_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,
  archived_by BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversations_status_last_message ON conversations(status, last_message_at);
CREATE INDEX IF NOT EXISTS idx_conversations_assigned_user ON conversations(assigned_user_id);

CREATE TABLE IF NOT EXISTS messages (
  id BIGSERIAL PRIMARY KEY,
  conversation_id BIGINT NOT NULL REFERENCES conversations(id),
  contact_id BIGINT NOT NULL REFERENCES contacts(id),
  direction VARCHAR(20) NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  type VARCHAR(30) NOT NULL CHECK (type IN ('text', 'image', 'video', 'document', 'audio', 'sticker', 'location', 'unknown')),
  body TEXT,
  whatsapp_message_id VARCHAR(190) UNIQUE,
  whatsapp_status VARCHAR(30) NOT NULL DEFAULT 'received' CHECK (whatsapp_status IN ('received', 'sent', 'delivered', 'read', 'failed')),
  media_id VARCHAR(190),
  media_url VARCHAR(500),
  media_mime_type VARCHAR(120),
  media_sha256 VARCHAR(190),
  original_payload JSONB,
  sent_by_user_id BIGINT REFERENCES users(id),
  message_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_created ON messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_contact_created ON messages(contact_id, created_at);

CREATE TABLE IF NOT EXISTS message_status_events (
  id BIGSERIAL PRIMARY KEY,
  message_id BIGINT REFERENCES messages(id),
  whatsapp_message_id VARCHAR(190) NOT NULL,
  status VARCHAR(40) NOT NULL,
  payload JSONB,
  event_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_status_events_wa_id ON message_status_events(whatsapp_message_id);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(id),
  action VARCHAR(120) NOT NULL,
  entity_type VARCHAR(80) NOT NULL,
  entity_id BIGINT,
  metadata JSONB,
  ip_address VARCHAR(80),
  user_agent VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created ON audit_logs(user_id, created_at);

CREATE TABLE IF NOT EXISTS broadcasts (
  id BIGSERIAL PRIMARY KEY,
  created_by BIGINT NOT NULL REFERENCES users(id),
  type VARCHAR(30) NOT NULL CHECK (type IN ('text', 'image', 'video', 'document')),
  body TEXT,
  media_url VARCHAR(500),
  media_mime_type VARCHAR(120),
  status VARCHAR(30) NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sending', 'completed', 'failed')),
  total_recipients INTEGER NOT NULL DEFAULT 0,
  sent_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS broadcast_recipients (
  id BIGSERIAL PRIMARY KEY,
  broadcast_id BIGINT NOT NULL REFERENCES broadcasts(id),
  contact_id BIGINT NOT NULL REFERENCES contacts(id),
  status VARCHAR(30) NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'failed')),
  error_message TEXT,
  whatsapp_message_id VARCHAR(190),
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_broadcast_recipients_broadcast ON broadcast_recipients(broadcast_id, status);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_contacts_updated_at ON contacts;
CREATE TRIGGER trg_contacts_updated_at BEFORE UPDATE ON contacts
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_conversations_updated_at ON conversations;
CREATE TRIGGER trg_conversations_updated_at BEFORE UPDATE ON conversations
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_broadcasts_updated_at ON broadcasts;
CREATE TRIGGER trg_broadcasts_updated_at BEFORE UPDATE ON broadcasts
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE FUNCTION prevent_history_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'History records cannot be deleted';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_messages_delete ON messages;
CREATE TRIGGER trg_prevent_messages_delete BEFORE DELETE ON messages
FOR EACH ROW EXECUTE FUNCTION prevent_history_delete();

DROP TRIGGER IF EXISTS trg_prevent_audit_delete ON audit_logs;
CREATE TRIGGER trg_prevent_audit_delete BEFORE DELETE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION prevent_history_delete();

DROP TRIGGER IF EXISTS trg_prevent_status_events_delete ON message_status_events;
CREATE TRIGGER trg_prevent_status_events_delete BEFORE DELETE ON message_status_events
FOR EACH ROW EXECUTE FUNCTION prevent_history_delete();
