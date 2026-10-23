import { query } from '../../db/client.js';

/**
 * Data Access Layer for Notification Logs and Expiry Scans.
 */
export const notificationsRepository = {
  /**
   * Retrieves active documents with expiry dates for a tenant.
   * @param {string} tenantId
   * @returns {Promise<any[]>}
   */
  async findExpiringDocuments(tenantId) {
    const res = await query(`
      SELECT id, display_name, document_type, expiry_date, category, owner_user_id
      FROM documents
      WHERE tenant_id = $1 AND status <> 'archived' AND expiry_date IS NOT NULL;
    `, [tenantId]);
    return res.rows;
  },

  /**
   * Retrieves active certificates for a tenant.
   * @param {string} tenantId
   * @returns {Promise<any[]>}
   */
  async findExpiringCertificates(tenantId) {
    const res = await query(`
      SELECT id, certificate_number, equipment_serial, expires_at
      FROM certificates
      WHERE tenant_id = $1 AND status <> 'revoked';
    `, [tenantId]);
    return res.rows;
  },

  /**
   * Inserts notification log with idempotency guarantee.
   * @param {object} logData
   * @returns {Promise<any|null>}
   */
  async insertLog({
    tenantId,
    recipientUserId,
    recipientAddress,
    channel = 'console',
    templateKey,
    context,
    status = 'sent',
    idempotencyKey
  }) {
    const res = await query(`
      INSERT INTO notification_logs (
        tenant_id, recipient_user_id, recipient_address, channel, template_key,
        context_jsonb, status, idempotency_key
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (tenant_id, idempotency_key) DO NOTHING
      RETURNING id;
    `, [
      tenantId,
      recipientUserId,
      recipientAddress,
      channel,
      templateKey,
      JSON.stringify(context),
      status,
      idempotencyKey
    ]);
    return res.rows[0] || null;
  },

  /**
   * Fetches recent notification logs for a tenant.
   * @param {string} tenantId
   * @param {number} limit
   * @returns {Promise<any[]>}
   */
  async findLogs(tenantId, limit = 50) {
    const res = await query(`
      SELECT n.*, u.name as recipient_name
      FROM notification_logs n
      LEFT JOIN users u ON n.recipient_user_id = u.id
      WHERE n.tenant_id = $1
      ORDER BY n.created_at DESC
      LIMIT $2;
    `, [tenantId, limit]);
    return res.rows;
  }
};
