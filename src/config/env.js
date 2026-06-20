const dotenv = require('dotenv');

dotenv.config();

const required = [
  'DATABASE_URL',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'JWT_SECRET',
  'WHATSAPP_VERIFY_TOKEN',
  'WHATSAPP_ACCESS_TOKEN',
  'WHATSAPP_PHONE_NUMBER_ID'
];

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

module.exports = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 3000),
  appUrl: process.env.APP_URL || 'http://localhost:3000',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  db: {
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DB_SSL !== 'false'
      ? { rejectUnauthorized: false }
      : false
  },
  supabase: {
    url: process.env.SUPABASE_URL,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    storageBucket: process.env.SUPABASE_STORAGE_BUCKET || 'whatsapp-media',
    storagePublic: process.env.SUPABASE_STORAGE_PUBLIC !== 'false'
  },
  whatsapp: {
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN,
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    apiVersion: process.env.WHATSAPP_API_VERSION || 'v20.0'
  },
  media: {
    storage: process.env.MEDIA_STORAGE || 'supabase',
    uploadDir: process.env.UPLOAD_DIR || 'uploads'
  },
  backup: {
    enabled: process.env.BACKUP_ENABLED === 'true',
    cron: process.env.BACKUP_CRON || '0 2 * * *',
    dir: process.env.BACKUP_DIR || 'backups',
    pgDumpPath: process.env.PG_DUMP_PATH || 'pg_dump'
  }
};
