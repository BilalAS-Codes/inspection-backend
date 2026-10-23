import { query } from '../../db/client.js';

/**
 * Data Access Layer for Work Orders and Checklists.
 */
export const workOrdersRepository = {
  /**
   * Lists work orders with engineer and certificate summaries.
   * @param {string} tenantId
   * @param {string} [status]
   * @returns {Promise<any[]>}
   */
  async findWorkOrders(tenantId, status) {
    let sql = `
      SELECT w.*, u.name as assigned_engineer_name, u.email as assigned_engineer_email,
             c.id as certificate_id, c.certificate_number, c.status as certificate_status,
             s.id as submission_id, s.result as inspection_result
      FROM work_orders w
      LEFT JOIN users u ON w.assigned_engineer_id = u.id
      LEFT JOIN inspection_submissions s ON s.work_order_id = w.id
      LEFT JOIN certificates c ON c.work_order_id = w.id
      WHERE w.tenant_id = $1
    `;
    const params = [tenantId];

    if (status) {
      sql += ' AND w.status = $2';
      params.push(status);
    }

    sql += ' ORDER BY w.created_at DESC;';
    const res = await query(sql, params);
    return res.rows;
  },

  /**
   * Finds work order by ID with assigned engineer details.
   * @param {string} id
   * @param {string} tenantId
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<any>}
   */
  async findWorkOrderById(id, tenantId, client = null) {
    const q = client ? client.query.bind(client) : query;
    const res = await q(`
      SELECT w.*, u.name as assigned_engineer_name, u.email as assigned_engineer_email,
             u.phone as assigned_engineer_phone
      FROM work_orders w
      LEFT JOIN users u ON w.assigned_engineer_id = u.id
      WHERE w.id = $1 AND w.tenant_id = $2;
    `, [id, tenantId]);
    return res.rows[0] || null;
  },

  /**
   * Checks engineer gate-pass compliance by inspecting expired mandatory credentials.
   * @param {string} engineerId
   * @returns {Promise<any[]>} List of expired documents
   */
  async findExpiredEngineerDocuments(engineerId) {
    const res = await query(`
      SELECT document_type, expiry_date, display_name
      FROM documents
      WHERE owner_user_id = $1
        AND document_type IN ('IQAMA', 'driving_license', 'car_registration')
        AND expiry_date < CURRENT_DATE
        AND status <> 'archived';
    `, [engineerId]);
    return res.rows;
  },

  /**
   * Updates assigned engineer and transitions status to 'assigned'.
   * @param {string} id
   * @param {string} tenantId
   * @param {string} engineerId
   * @returns {Promise<any>}
   */
  async assignEngineer(id, tenantId, engineerId) {
    const res = await query(`
      UPDATE work_orders
      SET assigned_engineer_id = $1,
          status = 'assigned'
      WHERE id = $2 AND tenant_id = $3
      RETURNING *;
    `, [engineerId, id, tenantId]);
    return res.rows[0];
  },

  /**
   * Updates work order status.
   * @param {string} id
   * @param {string} tenantId
   * @param {string} status
   * @returns {Promise<any>}
   */
  async updateStatus(id, tenantId, status) {
    const res = await query(`
      UPDATE work_orders
      SET status = $1
      WHERE id = $2 AND tenant_id = $3
      RETURNING *;
    `, [status, id, tenantId]);
    return res.rows[0];
  },

  /**
   * Fetches checklist template by category.
   * @param {string} tenantId
   * @param {string} category
   * @returns {Promise<any>}
   */
  async findChecklist(tenantId, category) {
    const res = await query(
      'SELECT * FROM inspection_checklists WHERE tenant_id = $1 AND equipment_type = $2;',
      [tenantId, category]
    );
    return res.rows[0] || null;
  },

  /**
   * Creates a new work order.
   * @param {import('pg').PoolClient} client
   * @param {object} data
   * @returns {Promise<any>}
   */
  async createWorkOrder(client, data) {
    const res = await client.query(`
      INSERT INTO work_orders (
        tenant_id, wo_number, client_name, client_email, client_phone,
        location_text, inspection_location, service_type, inspection_category,
        scope, certificate_validity_days, status, assigned_engineer_id, due_date
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
      ) RETURNING *;
    `, [
      data.tenantId,
      data.woNumber,
      data.clientName,
      data.clientEmail || null,
      data.clientPhone || null,
      data.locationText || null,
      data.locationText || null,
      data.serviceType || 'Regulatory Conformance',
      data.inspectionCategory || 'lifting',
      data.scope || 'Statutory Inspection and Compliance Certification',
      data.certificateValidityDays || 365,
      data.assignedEngineerId ? 'assigned' : 'open',
      data.assignedEngineerId || null,
      data.dueDate || null
    ]);
    return res.rows[0];
  }
};
