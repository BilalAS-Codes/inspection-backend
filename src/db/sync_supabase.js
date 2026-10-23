import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { pool as localPool } from './client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Supabase replication & migration sync utility.
 * Applies schema migrations to Supabase and populates it with exact local data.
 */
export async function syncToSupabase() {
  console.log('[Sync] Initializing Supabase synchronization...');

  const supabaseClient = new pg.Client({
    host: 'aws-0-ap-southeast-1.pooler.supabase.com',
    port: 5432,
    database: 'postgres',
    user: 'postgres.jnugpdyvbawbmqhdvteb',
    password: 'Q3xlt67Cdgo0utZw',
    ssl: { rejectUnauthorized: false }
  });

  await supabaseClient.connect();
  console.log('[Sync] Connected to remote Supabase instance.');

  try {
    // 1. Run migrations in order on Supabase
    console.log('[Sync] Running migration scripts on Supabase...');
    const migrationsDir = path.join(__dirname, 'migrations');
    const migrationFiles = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

    await supabaseClient.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        migration_name TEXT UNIQUE NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    for (const file of migrationFiles) {
      console.log(`[Sync] Applying migration ${file}...`);
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      try {
        await supabaseClient.query('BEGIN');
        await supabaseClient.query(sql);
        await supabaseClient.query(
          'INSERT INTO schema_migrations (migration_name) VALUES ($1) ON CONFLICT (migration_name) DO NOTHING;',
          [file]
        );
        await supabaseClient.query('COMMIT');
        console.log(`[Sync] Successfully applied ${file}`);
      } catch (mErr) {
        await supabaseClient.query('ROLLBACK');
        console.warn(`[Sync] Migration ${file} noticed notice/warning: ${mErr.message}`);
      }
    }

    // 2. Disable triggers / constraints temporarily to preserve UUIDs and referential integrity during data copy
    console.log('[Sync] Copying data from local database in dependency order...');
    await supabaseClient.query("SET session_replication_role = 'replica';");
    const tableOrder = [
      'tenants',
      'users',
      'clients',
      'leads',
      'proposal_templates',
      'proposals',
      'invoices',
      'payments',
      'work_orders',
      'inspection_checklists',
      'inspection_submissions',
      'certificates',
      'documents',
      'document_versions',
      'notification_logs',
      'audit_logs',
      'tenant_counters'
    ];

    for (const tableName of tableOrder) {
      const localData = await localPool.query(`SELECT * FROM "${tableName}";`);
      if (localData.rows.length === 0) {
        console.log(`[Sync] Table ${tableName} has 0 rows, skipping.`);
        continue;
      }

      console.log(`[Sync] Copying ${localData.rows.length} rows for ${tableName}...`);
      for (const row of localData.rows) {
        const columns = Object.keys(row);
        const values = Object.values(row).map(val => {
          if (val !== null && typeof val === 'object' && !(val instanceof Date) && !Buffer.isBuffer(val)) {
            return JSON.stringify(val);
          }
          return val;
        });
        const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
        const colList = columns.map(c => `"${c}"`).join(', ');

        const insertQuery = `
          INSERT INTO "${tableName}" (${colList})
          VALUES (${placeholders})
          ON CONFLICT DO NOTHING;
        `;

        await supabaseClient.query(insertQuery, values);
      }
      console.log(`[Sync] Completed ${tableName}`);
    }

    await supabaseClient.query("SET session_replication_role = 'origin';");
    console.log('[Sync] Complete data synchronization to Supabase finished successfully!');
    return { success: true };
  } catch (err) {
    console.error('[Sync] Sync failed:', err);
    throw err;
  } finally {
    await supabaseClient.end();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  syncToSupabase()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
