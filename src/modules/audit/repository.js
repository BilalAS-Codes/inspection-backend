import { query } from '../../db/client.js';

/**
 * Data Access Layer for immutable audit trail logs.
 */
export const auditRepository = {
  /**
   * Retrieves audit logs for a tenant with optional filtering by entity type and date range.
   * @param {string} tenantId
   * @param {object} filters
   * @returns {Promise<any[]>}
   */
  async findAuditLogs(tenantId, { entityType, from, to, limit = 200 } = {}) {
    let sql = `
      SELECT a.*, u.name as actor_name, u.email as actor_email
      FROM audit_logs a
      LEFT JOIN users u ON a.actor_user_id = u.id
      WHERE a.tenant_id = $1
    `;
    const params = [tenantId];
    let idx = 2;

    if (entityType) {
      sql += ` AND a.entity_type = $${idx++}`;
      params.push(entityType);
    }
    if (from) {
      sql += ` AND a.created_at >= $${idx++}`;
      params.push(from);
    }
    if (to) {
      sql += ` AND a.created_at <= $${idx++}`;
      params.push(to);
    }

    sql += ` ORDER BY a.created_at DESC LIMIT $${idx};`;
    params.push(limit);

    const result = await query(sql, params);
    return result.rows;
  }
};
