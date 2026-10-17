import pg from 'pg';

// Return DATE columns as plain 'YYYY-MM-DD' strings instead of JS Dates (avoids timezone drift).
pg.types.setTypeParser(1082, (v) => v);

export function createPool() {
  const { DATABASE_URL, DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD, DB_SSL } = process.env;
  // RDS PostgreSQL 15+ enforces TLS by default. For production hardening, pin the RDS CA bundle
  // instead of disabling certificate verification (see README "Hardening").
  const ssl = DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined;

  if (DATABASE_URL) {
    return new pg.Pool({ connectionString: DATABASE_URL, ssl });
  }
  return new pg.Pool({
    host: DB_HOST || 'localhost',
    port: Number(DB_PORT || 5432),
    database: DB_NAME || 'taskflow',
    user: DB_USER || 'taskflow',
    password: DB_PASSWORD || 'taskflow',
    ssl,
  });
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
     id SERIAL PRIMARY KEY,
     email TEXT NOT NULL UNIQUE,
     password_hash TEXT NOT NULL,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS tasks (
     id SERIAL PRIMARY KEY,
     user_id INTEGER NOT NULL REFERENCES users(id),
     title TEXT NOT NULL,
     notes TEXT NOT NULL DEFAULT '',
     priority INTEGER NOT NULL DEFAULT 2,
     status TEXT NOT NULL DEFAULT 'todo',
     due_date DATE,
     estimate_min INTEGER,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     completed_at TIMESTAMPTZ
   )`,
  `CREATE TABLE IF NOT EXISTS time_entries (
     id SERIAL PRIMARY KEY,
     user_id INTEGER NOT NULL REFERENCES users(id),
     task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
     started_at TIMESTAMPTZ NOT NULL,
     ended_at TIMESTAMPTZ
   )`,
  `CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_entries_user ON time_entries(user_id)`,
];

export async function migrate(pool) {
  for (const sql of SCHEMA) {
    await pool.query(sql);
  }
}
