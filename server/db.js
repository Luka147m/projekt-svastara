const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'Tramvaji',
  password: 'admin',
  port: 5432,
});

module.exports = { pool };
