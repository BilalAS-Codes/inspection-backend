import { query } from '../../db/client.js';

/**
 * Data Access Layer for Users and Inspectors.
 */
export const usersRepository = {
  /**
   * Retrieves users under a tenant, with real-time credential compliance status.
   * @param {string} tenantId - Tenant identifier
   * @param {object} [filters] - Optional filter criteria
   * @param {string} [filters.role] - User role ('engineer', 'admin', 'sales', 'finance')
   * @param {string} [filters.status] - User status ('active', 'disabled')
   * @returns {Promise<any[]>} List of users
   */
  async findUsers(tenantId, { role, status } = {}) {
    let sql = `
      SELECT u.id, u.tenant_id, u.email, u.name, u.role, u.phone, u.status, u.created_at,
        EXISTS(
          SELECT 1 FROM documents d
          WHERE d.owner_user_id = u.id AND d.status <> 'archived' AND d.expiry_date < now()
        ) as has_expired_docs,
        (
          SELECT COUNT(*)::int FROM work_orders w
          WHERE w.assigned_engineer_id = u.id AND w.status IN ('assigned', 'in_progress')
        ) as active_work_orders_count
      FROM users u
      WHERE u.tenant_id = $1
    `;
    const params = [tenantId];

    if (role) {
      params.push(role);
      sql += ` AND u.role = $${params.length}`;
    }

    if (status) {
      params.push(status);
      sql += ` AND u.status = $${params.length}`;
    }

    sql += ' ORDER BY u.name ASC;';

    const res = await query(sql, params);
    return res.rows;
  },

  /**
   * Finds a user by email within a tenant.
   * @param {string} tenantId - Tenant identifier
   * @param {string} email - Email address
   * @returns {Promise<any|null>} User record or null
   */
  async findUserByEmail(tenantId, email) {
    const res = await query(
      'SELECT * FROM users WHERE tenant_id = $1 AND LOWER(email) = LOWER($2);',
      [tenantId, email]
    );
    return res.rows[0] || null;
  },

  /**
   * Creates a new user or engineer record.
   * @param {string} tenantId - Tenant identifier
   * @param {object} user - User attributes
   * @returns {Promise<any>} Created user record without password hash
   */
  async createUser(tenantId, { email, passwordHash, name, role = 'engineer', phone, status = 'active' }) {
    const res = await query(`
      INSERT INTO users (
        tenant_id, email, password_hash, name, role, phone, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, tenant_id, email, name, role, phone, status, created_at;
    `, [tenantId, email.toLowerCase().trim(), passwordHash, name.trim(), role, phone || null, status]);
    return res.rows[0];
  },

  /**
   * Updates user status (active / disabled).
   * @param {string} id - User UUID
   * @param {string} tenantId - Tenant identifier
   * @param {string} status - New status ('active' | 'disabled')
   * @returns {Promise<any>} Updated user
   */
  async updateUserStatus(id, tenantId, status) {
    const res = await query(`
      UPDATE users
      SET status = $1
      WHERE id = $2 AND tenant_id = $3
      RETURNING id, tenant_id, email, name, role, phone, status, created_at;
    `, [status, id, tenantId]);
    return res.rows[0] || null;
  }
};
