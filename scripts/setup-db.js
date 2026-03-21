/**
 * One-time script to create the database tables.
 * Run from project root: node scripts/setup-db.js
 * Requires DATABASE_URL in environment (or in server/.env).
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', 'server', '.env') });
const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('Missing DATABASE_URL. Set it in server/.env or run: DATABASE_URL="your-url" node scripts/setup-db.js');
  process.exit(1);
}

const sql = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS months (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  income NUMERIC(12,2) DEFAULT 0,
  UNIQUE(user_id, year, month)
);

CREATE TABLE IF NOT EXISTS expenses (
  id SERIAL PRIMARY KEY,
  month_id INTEGER NOT NULL REFERENCES months(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  amount NUMERIC(12,2) NOT NULL
);
`;

async function main() {
  const pool = new Pool({ connectionString: DATABASE_URL });
  try {
    await pool.query(sql);
    console.log('Tables created (or already existed).');
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
