import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool, withTransaction } from './client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Migration runner that applies .sql migration files in alphabetical/numbered order.
 * Tracks executed migrations in a `schema_migrations` table to guarantee idempotency.
 */
export async function runMigrations() {
  console.log('[Migrate] Checking and executing database migrations...');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      migration_name TEXT UNIQUE NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  const appliedRes = await pool.query('SELECT migration_name FROM schema_migrations;');
  const appliedMigrations = new Set(appliedRes.rows.map(r => r.migration_name));

  const migrationsDir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

  for (const file of files) {
    if (appliedMigrations.has(file)) {
      continue;
    }

    console.log(`[Migrate] Applying ${file}...`);
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');

    await withTransaction(async (client) => {
      await client.query(sql);
      await client.query(
        'INSERT INTO schema_migrations (migration_name) VALUES ($1);',
        [file]
      );
    });

    console.log(`[Migrate] Successfully applied ${file}`);
  }

  console.log('[Migrate] All migrations are up to date.');
}

// Allow direct CLI execution: node src/db/migrate.js
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[Migrate] Migration failed:', err);
      process.exit(1);
    });
}
