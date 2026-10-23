import { query } from '../../db/client.js';

/**
 * Data Access Layer for Inspection Certificates and verification records.
 */
export const certificatesRepository = {
  /**
   * Retrieves all certificates for a tenant with work order details.
   * @param {string} tenantId
   * @returns {Promise<any[]>}
   */
  async findCertificatesByTenant(tenantId) {
    const res = await query(`
      SELECT c.*, w.wo_number, w.client_name
      FROM certificates c
      JOIN work_orders w ON c.work_order_id = w.id
      WHERE c.tenant_id = $1
      ORDER BY c.issued_at DESC;
    `, [tenantId]);
    return res.rows;
  },

  /**
   * Finds certificate by ID.
   * @param {string} id
   * @returns {Promise<any|null>}
   */
  async findCertificateById(id) {
    const res = await query('SELECT * FROM certificates WHERE id = $1;', [id]);
    return res.rows[0] || null;
  },

  /**
   * Finds certificate with tenant metadata for public verification.
   * @param {string} id
   * @returns {Promise<any|null>}
   */
  async findCertificateForPublicVerification(id) {
    const res = await query(`
      SELECT c.*, t.name as tenant_name, t.address as tenant_address, t.vat_number as tenant_vat
      FROM certificates c
      JOIN tenants t ON c.tenant_id = t.id
      WHERE c.id = $1;
    `, [id]);
    return res.rows[0] || null;
  },

  /**
   * Inserts an issued certificate using the transactional client.
   * @param {import('pg').PoolClient} client
   * @param {object} certData
   * @returns {Promise<any>}
   */
  async insertCertificate(client, {
    id,
    tenantId,
    workOrderId,
    inspectionSubmissionId,
    certificateNumber,
    certificateType,
    equipmentSerial,
    issuedAt,
    expiresAt,
    equipment,
    inspectingCompanyName,
    qrPayload,
    pdfStorageKey
  }) {
    const res = await client.query(`
      INSERT INTO certificates (
        id, tenant_id, work_order_id, inspection_submission_id, certificate_number,
        certificate_type, equipment_serial, status, issued_at, expires_at,
        equipment_jsonb, inspecting_company_name, qr_payload, pdf_key
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, 'issued', $8, $9, $10, $11, $12, $13
      ) RETURNING *;
    `, [
      id,
      tenantId,
      workOrderId,
      inspectionSubmissionId,
      certificateNumber,
      certificateType,
      equipmentSerial,
      issuedAt,
      expiresAt,
      JSON.stringify(equipment),
      inspectingCompanyName,
      qrPayload,
      pdfStorageKey
    ]);
    return res.rows[0];
  },

  /**
   * Checks for duplicate active certificate issued today for same equipment and cert type.
   * @param {import('pg').PoolClient} client
   * @param {string} tenantId
   * @param {string} equipmentSerial
   * @param {string} certificateType
   * @returns {Promise<any|null>}
   */
  async findDuplicateToday(client, tenantId, equipmentSerial, certificateType) {
    const res = await client.query(`
      SELECT id, certificate_number FROM certificates
      WHERE tenant_id = $1 AND equipment_serial = $2 AND certificate_type = $3
        AND status <> 'revoked'
        AND (issued_at AT TIME ZONE 'UTC')::date = (CURRENT_DATE AT TIME ZONE 'UTC')::date;
    `, [tenantId, equipmentSerial, certificateType]);
    return res.rows[0] || null;
  },

  /**
   * Revokes an issued certificate.
   * @param {string} id
   * @param {string} tenantId
   * @param {string} reason
   * @returns {Promise<any|null>}
   */
  async revokeCertificate(id, tenantId, reason) {
    const res = await query(`
      UPDATE certificates
      SET status = 'revoked',
          revocation_reason = $1,
          revoked_at = now()
      WHERE id = $2 AND tenant_id = $3 AND status = 'issued'
      RETURNING *;
    `, [reason, id, tenantId]);
    return res.rows[0] || null;
  }
};
