const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false }
});


pool.connect()
  .then(client => {
    console.log('Connected to Supabase PostgreSQL');
    client.release();
  })
  .catch(err => {
    console.error('Error connecting to database:', err.message);
  });

module.exports = pool;
