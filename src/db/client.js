import pg from 'pg';
import { config } from '../config.js';

const { Pool } = pg;

/**
 * Global PostgreSQL client pool for executing queries against the invertio_demo database.
 * Configured using discrete default properties (host, port, database, user, password).
 */
const useSsl = config.DB_SSL || config.DB_HOST.includes('supabase.com') || (config.DATABASE_URL && config.DATABASE_URL.includes('supabase.com'));

export const pool = new Pool(
  config.DATABASE_URL
    ? {
        connectionString: config.DATABASE_URL,
        ssl: useSsl ? { rejectUnauthorized: false } : undefined,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
      }
    : {
        host: config.DB_HOST,
        port: config.DB_PORT,
        database: config.DB_NAME,
        user: config.DB_USER,
        password: config.DB_PASSWORD,
        ssl: useSsl ? { rejectUnauthorized: false } : undefined,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
      }
);

pool.on('error', (err) => {
  console.error('[DB] Unexpected error on idle database client', err);
});

/**
 * Execute a parameterized SQL query using the shared pool.
 * @param {string} text - SQL query string with positional placeholders ($1, $2, etc.)
 * @param {Array<any>} [params] - Query parameter array
 * @returns {Promise<pg.QueryResult<any>>}
 */
export async function query(text, params) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  if (config.LOG_LEVEL === 'debug') {
    console.debug('[DB Query]', { text, duration, rows: res.rowCount });
  }
  return res;
}

/**
 * Acquire a dedicated client from the pool to run a multi-statement transaction.
 * @template T
 * @param {(client: pg.PoolClient) => Promise<T>} callback - Work function with transaction client
 * @returns {Promise<T>}
 */
export async function withTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
