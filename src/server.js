const cron = require('node-cron');
const app = require('./app');
const env = require('./config/env');
const { runBackup } = require('./scripts/backup');

app.listen(env.port, () => {
  console.log(`API listening on port ${env.port}`);
});

if (env.backup.enabled) {
  cron.schedule(env.backup.cron, () => {
    runBackup().catch((error) => console.error('Backup failed', error));
  });
}
