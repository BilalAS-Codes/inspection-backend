import { query } from '../../db/client.js';

/**
 * Data Access Layer for User and Authentication entities.
 */
export const authRepository = {
  /**
   * Finds an active user by email across all tenants.
   * @param {string} email
   * @returns {Promise<any>}
   */
  async findUserByEmail(email) {
    const res = await query(`
      SELECT u.id, u.tenant_id, u.email, u.password_hash, u.name, u.role, u.status, t.name as tenant_name
      FROM users u
      JOIN tenants t ON u.tenant_id = t.id
      WHERE lower(u.email) = lower($1);
    `, [email]);
    return res.rows[0] || null;
  },

  /**
   * Finds user details by ID and Tenant ID.
   * @param {string} userId
   * @param {string} tenantId
   * @returns {Promise<any>}
   */
  async findUserById(userId, tenantId) {
    const res = await query(`
      SELECT u.id, u.tenant_id, u.email, u.name, u.role, u.phone, u.status, t.name as tenant_name
      FROM users u
      JOIN tenants t ON u.tenant_id = t.id
      WHERE u.id = $1 AND u.tenant_id = $2;
    `, [userId, tenantId]);
    return res.rows[0] || null;
  }
};
