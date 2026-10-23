import { query } from '../../db/client.js';

/**
 * Data Access Layer for Leads.
 */
export const leadsRepository = {
  /**
   * Retrieves leads matching filter criteria.
   * @param {string} tenantId
   * @param {object} filters
   * @returns {Promise<any[]>}
   */
  async findLeads(tenantId, { status, source, q } = {}) {
    let sql = `
      SELECT l.id, l.source, l.client_name, l.contact_email, l.contact_phone,
             l.status, l.assigned_to, l.notes, l.created_at, l.updated_at,
             u.name as assigned_to_name
      FROM leads l
      LEFT JOIN users u ON l.assigned_to = u.id
      WHERE l.tenant_id = $1
    `;
    const params = [tenantId];
    let idx = 2;

    if (status) {
      sql += ` AND l.status = $${idx++}`;
      params.push(status);
    }
    if (source) {
      sql += ` AND l.source = $${idx++}`;
      params.push(source);
    }
    if (q) {
      sql += ` AND (l.client_name ILIKE $${idx} OR l.contact_email ILIKE $${idx} OR l.contact_phone ILIKE $${idx})`;
      params.push(`%${q}%`);
      idx++;
    }

    sql += ' ORDER BY l.created_at DESC;';
    const res = await query(sql, params);
    return res.rows;
  },

  /**
   * Finds a lead by ID within tenant scope.
   * @param {string} id
   * @param {string} tenantId
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<any>}
   */
  async findLeadById(id, tenantId, client = null) {
    const q = client ? client.query.bind(client) : query;
    const res = await q(
      'SELECT * FROM leads WHERE id = $1 AND tenant_id = $2;',
      [id, tenantId]
    );
    return res.rows[0] || null;
  },

  /**
   * Inserts a new lead.
   * @param {string} tenantId
   * @param {object} data
   * @returns {Promise<any>}
   */
  async createLead(tenantId, { source, clientName, contactEmail, contactPhone, assignedTo, notes }) {
    const res = await query(`
      INSERT INTO leads (tenant_id, source, client_name, contact_email, contact_phone, assigned_to, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *;
    `, [tenantId, source, clientName, contactEmail, contactPhone, assignedTo || null, notes || null]);
    return res.rows[0];
  },

  /**
   * Finds existing active lead for deduplication check.
   * @param {string} tenantId
   * @param {string} contactEmail
   * @param {string} contactPhone
   * @param {string} source
   * @returns {Promise<any>}
   */
  async findExistingLead(tenantId, contactEmail, contactPhone, source) {
    const res = await query(`
      SELECT id, client_name, status FROM leads
      WHERE tenant_id = $1 AND lower(contact_email) = $2 AND COALESCE(contact_phone,'') = $3 AND source = $4 AND status <> 'lost';
    `, [tenantId, contactEmail, contactPhone, source]);
    return res.rows[0] || null;
  },

  /**
   * Updates lead status.
   * @param {string} id
   * @param {string} tenantId
   * @param {string} status
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<any>}
   */
  async updateStatus(id, tenantId, status, client = null) {
    const q = client ? client.query.bind(client) : query;
    const res = await q(`
      UPDATE leads
      SET status = $1, updated_at = now()
      WHERE id = $2 AND tenant_id = $3
      RETURNING *;
    `, [status, id, tenantId]);
    return res.rows[0] || null;
  }
};
