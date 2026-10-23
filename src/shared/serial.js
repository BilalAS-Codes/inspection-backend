/**
 * Generates an atomic monotonically increasing sequential counter for a given tenant and entity namespace.
 * Uses PostgreSQL function next_serial(p_tenant, p_name) with row-level locking.
 *
 * @param {import('pg').Pool | import('pg').PoolClient} clientOrPool
 * @param {string} tenantId - Tenant UUID
 * @param {string} counterName - Counter namespace (e.g. 'invoice', 'work_order', 'certificate')
 * @returns {Promise<number>} Sequential counter value
 */
export async function nextSerial(clientOrPool, tenantId, counterName) {
  const res = await clientOrPool.query(
    'SELECT next_serial($1::uuid, $2::text) AS seq;',
    [tenantId, counterName]
  );
  return Number(res.rows[0].seq);
}

/**
 * Generates an atomic sequential number that is guaranteed not to collide with any
 * existing record in the target table for this tenant (e.g. historical or seeded data).
 * Advances the counter until a unique candidate is secured.
 *
 * @param {import('pg').Pool | import('pg').PoolClient} clientOrPool
 * @param {string} tenantId - Tenant UUID
 * @param {string} counterName - Counter namespace in tenant_counters
 * @param {'work_orders' | 'invoices' | 'certificates'} tableName - Target SQL table
 * @param {'wo_number' | 'invoice_number' | 'certificate_number'} columnName - Target SQL column
 * @param {string} prefix - Identifier prefix (e.g. 'WO-', 'INV-', 'CERT-')
 * @param {number} [padLength=6] - Number of zero-padded digits
 * @returns {Promise<string>} Fully formatted unique serial string
 */
export async function getNextUniqueSerial(
  clientOrPool,
  tenantId,
  counterName,
  tableName,
  columnName,
  prefix,
  padLength = 6
) {
  const ALLOWED_TABLES = ['work_orders', 'invoices', 'certificates'];
  const ALLOWED_COLUMNS = ['wo_number', 'invoice_number', 'certificate_number'];

  if (!ALLOWED_TABLES.includes(tableName) || !ALLOWED_COLUMNS.includes(columnName)) {
    throw new Error(`Invalid table or column specified for unique serial generation: ${tableName}.${columnName}`);
  }

  while (true) {
    const seq = await nextSerial(clientOrPool, tenantId, counterName);
    const candidate = `${prefix}${String(seq).padStart(padLength, '0')}`;

    const check = await clientOrPool.query(
      `SELECT 1 FROM ${tableName} WHERE tenant_id = $1 AND ${columnName} = $2 LIMIT 1;`,
      [tenantId, candidate]
    );

    if (check.rows.length === 0) {
      return candidate;
    }
  }
}

