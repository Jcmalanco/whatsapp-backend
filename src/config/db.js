const { Pool } = require('pg');
const env = require('./env');

const pool = new Pool({
  connectionString: env.db.connectionString,
  ssl: env.db.ssl
});

function toPostgresQuery(sql) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

async function execute(sql, params = []) {
  const result = await pool.query(toPostgresQuery(sql), params);
  return [result.rows, result];
}

async function query(sql, params = []) {
  return execute(sql, params);
}

module.exports = { execute, query, raw: pool };
