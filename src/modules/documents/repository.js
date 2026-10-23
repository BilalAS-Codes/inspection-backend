import { query } from '../../db/client.js';

/**
 * Data Access Layer for Documents and Document Versions.
 */
export const documentsRepository = {
  /**
   * Lists documents with current version and user details.
   * @param {string} tenantId
   * @param {object} filters
   * @returns {Promise<any[]>}
   */
  async findDocuments(tenantId, { category, expiringInDays } = {}) {
    let sql = `
      SELECT d.*, v.version_number, v.file_name, v.mime_type, v.file_size, v.storage_key,
             u.name as owner_name, u.email as owner_email
      FROM documents d
      LEFT JOIN document_versions v ON d.current_version_id = v.id
      LEFT JOIN users u ON d.owner_user_id = u.id
      WHERE d.tenant_id = $1 AND d.status <> 'archived'
    `;
    const params = [tenantId];
    let idx = 2;

    if (category) {
      sql += ` AND d.category = $${idx++}`;
      params.push(category);
    }

    if (expiringInDays) {
      sql += ` AND d.expiry_date IS NOT NULL AND d.expiry_date <= (CURRENT_DATE + ($${idx++} * INTERVAL '1 day'))`;
      params.push(Number(expiringInDays));
    }

    sql += ' ORDER BY d.expiry_date ASC NULLS LAST, d.created_at DESC;';
    const res = await query(sql, params);
    return res.rows;
  },

  /**
   * Finds document by ID within tenant.
   * @param {string} id
   * @param {string} tenantId
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<any>}
   */
  async findDocumentById(id, tenantId, client = null) {
    const q = client ? client.query.bind(client) : query;
    const res = await q(
      'SELECT * FROM documents WHERE id = $1 AND tenant_id = $2;',
      [id, tenantId]
    );
    return res.rows[0] || null;
  },

  /**
   * Finds active work orders for an engineer to check for deletion conflicts.
   * @param {string} tenantId
   * @param {string} engineerId
   * @returns {Promise<any[]>}
   */
  async findActiveWorkOrdersForEngineer(tenantId, engineerId) {
    const res = await query(`
      SELECT id, wo_number, status, client_name
      FROM work_orders
      WHERE tenant_id = $1
        AND assigned_engineer_id = $2
        AND status IN ('assigned', 'in_progress');
    `, [tenantId, engineerId]);
    return res.rows;
  },

  /**
   * Soft deletes a document (status = 'archived').
   * @param {string} id
   * @param {string} tenantId
   * @returns {Promise<any>}
   */
  async archiveDocument(id, tenantId) {
    const res = await query(
      "UPDATE documents SET status = 'archived' WHERE id = $1 AND tenant_id = $2 RETURNING *;",
      [id, tenantId]
    );
    return res.rows[0];
  }
};
