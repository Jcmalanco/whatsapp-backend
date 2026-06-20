const fs = require('fs/promises');
const path = require('path');
const { spawn } = require('child_process');
const env = require('../config/env');

async function runBackup() {
  await fs.mkdir(env.backup.dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const databaseName = new URL(env.db.connectionString).pathname.replace('/', '') || 'supabase';
  const finalOutput = path.join(env.backup.dir, `${databaseName}-${stamp}.sql`);

  await new Promise((resolve, reject) => {
    const dump = spawn(env.backup.pgDumpPath, [env.db.connectionString]);
    const chunks = [];
    const errors = [];

    dump.stdout.on('data', (chunk) => chunks.push(chunk));
    dump.stderr.on('data', (chunk) => errors.push(chunk));
    dump.on('close', async (code) => {
      if (code !== 0) {
        return reject(new Error(Buffer.concat(errors).toString() || `pg_dump exited with ${code}`));
      }
      await fs.writeFile(finalOutput, Buffer.concat(chunks));
      resolve();
    });
  });

  console.log(`Backup created: ${finalOutput}`);
  return finalOutput;
}

module.exports = { runBackup };

if (require.main === module) {
  runBackup().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
