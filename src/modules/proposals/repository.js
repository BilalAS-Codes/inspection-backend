import { query } from '../../db/client.js';

/**
 * Data Access Layer for Proposals and Templates.
 */
export const proposalsRepository = {
  /**
   * Lists proposals for tenant.
   * @param {string} tenantId
   * @returns {Promise<any[]>}
   */
  async findProposals(tenantId) {
    const res = await query(`
      SELECT p.id, p.lead_id, p.type, p.status, p.content_jsonb, p.pdf_key,
             p.accepted_at, p.accepted_by_email, p.created_at,
             l.client_name, l.contact_email
      FROM proposals p
      LEFT JOIN leads l ON p.lead_id = l.id
      WHERE p.tenant_id = $1
      ORDER BY p.created_at DESC;
    `, [tenantId]);
    return res.rows;
  },

  /**
   * Finds proposal template by type.
   * @param {string} tenantId
   * @param {string} type
   * @returns {Promise<any>}
   */
  async findTemplate(tenantId, type) {
    const res = await query(
      'SELECT body_html FROM proposal_templates WHERE tenant_id = $1 AND type = $2;',
      [tenantId, type]
    );
    return res.rows[0] || null;
  },

  /**
   * Finds proposal by ID and Tenant.
   * @param {string} id
   * @param {string} tenantId
   * @returns {Promise<any>}
   */
  async findProposalById(id, tenantId) {
    const res = await query(
      'SELECT * FROM proposals WHERE id = $1 AND tenant_id = $2;',
      [id, tenantId]
    );
    return res.rows[0] || null;
  },

  /**
   * Creates a draft proposal.
   * @param {string} tenantId
   * @param {string|null} leadId
   * @param {string} type
   * @param {object} variables
   * @returns {Promise<any>}
   */
  async createProposal(tenantId, leadId, type, variables) {
    const res = await query(`
      INSERT INTO proposals (tenant_id, lead_id, type, status, content_jsonb)
      VALUES ($1, $2, $3, 'draft', $4)
      RETURNING *;
    `, [tenantId, leadId || null, type, JSON.stringify(variables)]);
    return res.rows[0];
  },

  /**
   * Updates proposal on send with storageKey and hashed access token.
   * @param {string} id
   * @param {string} tenantId
   * @param {string} pdfKey
   * @param {string} tokenHash
   * @param {string} expiresAt
   * @returns {Promise<any>}
   */
  async markProposalSent(id, tenantId, pdfKey, tokenHash, expiresAt) {
    const res = await query(`
      UPDATE proposals
      SET status = 'sent',
          pdf_key = $1,
          access_token_hash = $2,
          access_token_expires_at = $3
      WHERE id = $4 AND tenant_id = $5
      RETURNING *;
    `, [pdfKey, tokenHash, expiresAt, id, tenantId]);
    return res.rows[0];
  },

  /**
   * Looks up proposal by access token hash for public access.
   * @param {string} tokenHash
   * @returns {Promise<any>}
   */
  async findByTokenHash(tokenHash) {
    const res = await query(`
      SELECT p.id, p.tenant_id, p.lead_id, p.type, p.status, p.content_jsonb, p.pdf_key,
             p.access_token_expires_at, p.accepted_at, p.accepted_by_email,
             t.name as tenant_name, t.address as tenant_address, t.vat_number as tenant_vat
      FROM proposals p
      JOIN tenants t ON p.tenant_id = t.id
      WHERE p.access_token_hash = $1;
    `, [tokenHash]);
    return res.rows[0] || null;
  }
};
