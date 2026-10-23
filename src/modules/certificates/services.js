import crypto from 'crypto';
import { certificatesRepository } from './repository.js';
import { query, withTransaction } from '../../db/client.js';
import { AppError } from '../../shared/errors.js';
import { writeAudit } from '../../shared/audit.js';
import { nextSerial, getNextUniqueSerial } from '../../shared/serial.js';
import { signVerifyToken, verifyToken, generateQrBuffer } from '../../shared/qr.js';
import { renderCertificatePdf } from '../../shared/pdf.js';
import { storage } from '../../shared/storage.js';
import { config } from '../../config.js';

/**
 * Service Layer for Certificate generation, signing, PDF rendering, revocation, and public QR verification.
 */
export const certificatesService = {
  /**
   * Lists all certificates for a tenant with public storage URLs.
   * @param {string} tenantId
   * @returns {Promise<any[]>}
   */
  async listCertificates(tenantId) {
    const rows = await certificatesRepository.findCertificatesByTenant(tenantId);
    return rows.map(row => ({
      ...row,
      pdfUrl: row.pdf_key ? storage.publicUrl(row.pdf_key) : null,
      qrUrl: `${config.API_BASE_URL}/api/certificates/${row.id}/qr.png`
    }));
  },

  /**
   * Issues a new inspection certificate based on a 'safe' inspection submission.
   * Enforces:
   * 1. Work Order must exist.
   * 2. Inspection submission must exist and result must strictly be 'safe'.
   * 3. Prevents duplicate certificate generation for same serial + type + day (409).
   * 4. Signs cryptographic QR JWT using jose.
   * 5. Renders branded PDF with embedded QR.
   * 6. Audits issuance.
   * @param {string} tenantId
   * @param {string} actorUserId
   * @param {object} params
   * @returns {Promise<any>}
   */
  async issueCertificate(tenantId, actorUserId, { workOrderId, certificateType }) {
    return await withTransaction(async (client) => {
      // 1. Fetch Work Order and Inspection Submission
      const woRes = await client.query(
        'SELECT * FROM work_orders WHERE id = $1 AND tenant_id = $2 FOR UPDATE;',
        [workOrderId, tenantId]
      );

      if (woRes.rows.length === 0) {
        throw new AppError('NOT_FOUND', 'Work Order not found.', 404);
      }

      const wo = woRes.rows[0];

      const subRes = await client.query(
        'SELECT * FROM inspection_submissions WHERE work_order_id = $1;',
        [workOrderId]
      );

      if (subRes.rows.length === 0) {
        throw new AppError('UNPROCESSABLE', 'No inspection has been submitted for this work order yet.', 422);
      }

      const submission = subRes.rows[0];

      // CRITICAL CHECK: Result must be 'safe'
      if (submission.result !== 'safe') {
        throw new AppError(
          'UNPROCESSABLE',
          `Cannot issue certificate: Inspection outcome is '${submission.result}'. Only 'safe' equipment can be certified.`,
          422,
          { reason: 'inspection_not_safe', result: submission.result }
        );
      }

      const equipment = submission.equipment_jsonb;
      const equipmentSerial = equipment?.serial || 'UNKNOWN-SERIAL';

      // 2. Generate Certificate Number: CERT-<YYYY>-<serial>
      const year = new Date().getFullYear();
      const certificateNumber = await getNextUniqueSerial(
        client,
        tenantId,
        'certificate',
        'certificates',
        'certificate_number',
        `CERT-${year}-`
      );

      // 3. Pre-create UUID for certificate
      const certId = crypto.randomUUID();

      // 4. Sign JWT for QR verification
      const qrJwt = await signVerifyToken({
        certId,
        serial: equipmentSerial,
        ttlDays: wo.certificate_validity_days || 365
      });

      const verifyUrl = `${config.WEB_BASE_URL}/verify/${qrJwt}`;

      // 5. Generate QR Code PNG Buffer
      const qrPngBuffer = await generateQrBuffer(verifyUrl);

      // 6. Generate Official Certificate PDF with embedded QR
      const tenantRes = await client.query('SELECT name FROM tenants WHERE id = $1;', [tenantId]);
      const inspectingCompanyName = tenantRes.rows[0]?.name || 'Musadaqah Business Solution';

      const issuedAt = new Date();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + (wo.certificate_validity_days || 365));

      const certPdfBuffer = await renderCertificatePdf({
        certificateNumber,
        certificateType: certificateType.replace(/_/g, ' ').toUpperCase(),
        equipmentSerial,
        inspectingCompanyName,
        issuedAt: issuedAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
        equipment,
        verifyUrl
      }, qrPngBuffer);

      // 7. Persist Certificate PDF and QR to storage
      const pdfStorageKey = `certificates/${tenantId}/${certId}.pdf`;
      const qrStorageKey = `certificates/${tenantId}/${certId}_qr.png`;

      await storage.put(pdfStorageKey, certPdfBuffer, 'application/pdf');
      await storage.put(qrStorageKey, qrPngBuffer, 'image/png');

      // 8. Insert Certificate into Database (protected by cert_dedupe_idx)
      try {
        const certificate = await certificatesRepository.insertCertificate(client, {
          id: certId,
          tenantId,
          workOrderId,
          inspectionSubmissionId: submission.id,
          certificateNumber,
          certificateType,
          equipmentSerial,
          issuedAt: issuedAt.toISOString(),
          expiresAt: expiresAt.toISOString(),
          equipment,
          inspectingCompanyName,
          qrPayload: qrJwt,
          pdfStorageKey
        });

        await writeAudit(client, {
          tenantId,
          actorUserId,
          action: 'certificate.issue',
          entityType: 'certificate',
          entityId: certificate.id,
          after: { certificateNumber, equipmentSerial, certificateType }
        });

        return {
          ...certificate,
          pdfUrl: storage.publicUrl(pdfStorageKey),
          qrUrl: `${config.API_BASE_URL}/api/certificates/${certificate.id}/qr.png`
        };
      } catch (dbErr) {
        if (dbErr.code === '23505' && dbErr.constraint === 'cert_dedupe_idx') {
          const dup = await certificatesRepository.findDuplicateToday(client, tenantId, equipmentSerial, certificateType);
          throw new AppError(
            'CONFLICT',
            'A valid certificate has already been issued for this equipment and certificate type today.',
            409,
            { existingCertificateId: dup?.id, equipmentSerial, certificateType }
          );
        }
        throw dbErr;
      }
    });
  },

  /**
   * Revokes an issued certificate.
   * @param {string} tenantId
   * @param {string} actorUserId
   * @param {string} id
   * @param {string} reason
   * @returns {Promise<any>}
   */
  async revokeCertificate(tenantId, actorUserId, id, reason) {
    const revokedCert = await certificatesRepository.revokeCertificate(id, tenantId, reason);

    if (!revokedCert) {
      const cert = await certificatesRepository.findCertificateById(id);
      if (!cert) {
        throw new AppError('NOT_FOUND', 'Certificate not found.', 404);
      }
      if (cert.status === 'revoked') {
        throw new AppError('CONFLICT', 'Certificate has already been revoked.', 409);
      }
      throw new AppError('UNPROCESSABLE', 'Could not revoke certificate.', 422);
    }

    await writeAudit(query, {
      tenantId,
      actorUserId,
      action: 'certificate.revoke',
      entityType: 'certificate',
      entityId: id,
      before: { status: 'issued' },
      after: { status: 'revoked', reason, revokedAt: revokedCert.revoked_at }
    });

    return revokedCert;
  },

  /**
   * Streams certificate PDF buffer.
   * @param {string} id
   * @returns {Promise<{ buffer: Buffer, filename: string }>}
   */
  async getPdfBuffer(id) {
    const cert = await certificatesRepository.findCertificateById(id);
    if (!cert || !cert.pdf_key) {
      throw new AppError('NOT_FOUND', 'Certificate PDF not found.', 404);
    }
    const buffer = await storage.get(cert.pdf_key);
    return {
      buffer,
      filename: `${cert.certificate_number}.pdf`
    };
  },

  /**
   * Streams certificate QR image buffer.
   * @param {string} id
   * @returns {Promise<Buffer>}
   */
  async getQrBuffer(id) {
    const cert = await certificatesRepository.findCertificateById(id);
    if (!cert) {
      throw new AppError('NOT_FOUND', 'Certificate not found.', 404);
    }
    const verifyUrl = `${config.WEB_BASE_URL}/verify/${cert.qr_payload}`;
    return await generateQrBuffer(verifyUrl);
  },

  /**
   * Public verification endpoint with anti-enumeration protection.
   * @param {string} token
   * @param {string} ip
   * @returns {Promise<any|null>}
   */
  async verifyCertificate(token, ip) {
    // 1. Verify token signature
    const claims = await verifyToken(token);
    if (!claims || !claims.certId) {
      return null; // Return null so controller returns identical 404
    }

    // 2. Fetch certificate live from DB
    const cert = await certificatesRepository.findCertificateForPublicVerification(claims.certId);
    if (!cert) {
      return null;
    }

    // 3. Compute live status
    let computedStatus = 'issued';
    if (cert.revoked_at) {
      computedStatus = 'revoked';
    } else if (new Date(cert.expires_at) < new Date()) {
      computedStatus = 'expired';
    }

    // 4. Log public verification audit
    await writeAudit(query, {
      tenantId: cert.tenant_id,
      actorUserId: null,
      action: 'certificate.public_verify',
      entityType: 'certificate',
      entityId: cert.id,
      after: {
        computedStatus,
        equipmentSerial: cert.equipment_serial,
        ip
      }
    });

    return {
      valid: true,
      status: computedStatus,
      certificateNumber: cert.certificate_number,
      certificateType: cert.certificate_type,
      equipmentSerial: cert.equipment_serial,
      equipment: cert.equipment_jsonb,
      issuedAt: cert.issued_at,
      expiresAt: cert.expires_at,
      inspectingCompany: cert.inspecting_company_name || cert.tenant_name,
      revocationReason: cert.revocation_reason,
      revokedAt: cert.revoked_at,
      tenant: {
        name: cert.tenant_name,
        vatNumber: cert.tenant_vat
      }
    };
  }
};
