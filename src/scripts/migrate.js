const fs = require('fs/promises');
const path = require('path');
const pool = require('../config/db');
const { ensureStorageBucket } = require('./setupStorage');

async function main() {
  const schemaPath = path.join(__dirname, '../../database/schema.sql');
  const schema = await fs.readFile(schemaPath, 'utf8');
  await pool.raw.query(schema);
  await ensureStorageBucket();
  await pool.raw.end();
  console.log('Supabase database migrated and storage bucket verified');
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
