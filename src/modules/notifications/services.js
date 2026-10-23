import { notificationsRepository } from './repository.js';
import { query } from '../../db/client.js';
import { writeAudit } from '../../shared/audit.js';

/**
 * Service Layer for automated expiration scanning and notification dispatch.
 */
export const notificationsService = {
  /**
   * Scans documents and certificates for expiry across predefined time windows:
   * 30 days, 7 days, 1 day, and expired.
   * Dispatches alerts with deduplication via idempotency keys.
   * @param {string} tenantId
   * @param {object} actorUser
   * @returns {Promise<{ scanned: number, notified: number, deduped: number, message: string }>}
   */
  async runExpiryScan(tenantId, actorUser) {
    let scanned = 0;
    let notified = 0;
    let deduped = 0;

    const windows = [
      { key: 'expired', minDays: -9999, maxDays: 0, label: 'Expired' },
      { key: '1d', minDays: 0, maxDays: 1, label: 'Expiring in 24 hours' },
      { key: '7d', minDays: 1, maxDays: 7, label: 'Expiring in 7 days' },
      { key: '30d', minDays: 7, maxDays: 30, label: 'Expiring in 30 days' }
    ];

    const now = new Date();
    now.setHours(0, 0, 0, 0);

    // 1. Scan Documents
    const docs = await notificationsRepository.findExpiringDocuments(tenantId);
    for (const doc of docs) {
      scanned++;
      const expDate = new Date(doc.expiry_date);
      expDate.setHours(0, 0, 0, 0);
      const diffDays = Math.ceil((expDate - now) / (1000 * 60 * 60 * 24));

      for (const win of windows) {
        if (diffDays >= win.minDays && diffDays <= win.maxDays) {
          const idempotencyKey = `doc:${doc.id}:${win.key}`;
          const context = {
            displayName: doc.display_name,
            documentType: doc.document_type,
            expiryDate: doc.expiry_date,
            window: win.key
          };

          const inserted = await notificationsRepository.insertLog({
            tenantId,
            recipientUserId: doc.owner_user_id || actorUser.id,
            recipientAddress: actorUser.email,
            channel: 'console',
            templateKey: 'document_expiry_alert',
            context,
            status: 'sent',
            idempotencyKey
          });

          if (inserted) {
            notified++;
          } else {
            deduped++;
          }
        }
      }
    }

    // 2. Scan Certificates
    const certs = await notificationsRepository.findExpiringCertificates(tenantId);
    for (const cert of certs) {
      scanned++;
      const expDate = new Date(cert.expires_at);
      expDate.setHours(0, 0, 0, 0);
      const diffDays = Math.ceil((expDate - now) / (1000 * 60 * 60 * 24));

      for (const win of windows) {
        if (diffDays >= win.minDays && diffDays <= win.maxDays) {
          const idempotencyKey = `cert:${cert.id}:${win.key}`;
          const context = {
            certificateNumber: cert.certificate_number,
            equipmentSerial: cert.equipment_serial,
            expiresAt: cert.expires_at,
            window: win.key
          };

          const inserted = await notificationsRepository.insertLog({
            tenantId,
            recipientUserId: actorUser.id,
            recipientAddress: actorUser.email,
            channel: 'console',
            templateKey: 'certificate_expiry_alert',
            context,
            status: 'sent',
            idempotencyKey
          });

          if (inserted) {
            notified++;
          } else {
            deduped++;
          }
        }
      }
    }

    await writeAudit(query, {
      tenantId,
      actorUserId: actorUser.id,
      action: 'notification.scan',
      entityType: 'notification_logs',
      after: { scanned, notified, deduped }
    });

    return {
      scanned,
      notified,
      deduped,
      message: `Expiry scan complete: ${scanned} scanned, ${notified} notified, ${deduped} deduped.`
    };
  },

  /**
   * Retrieves notification logs for tenant.
   * @param {string} tenantId
   * @param {number} limit
   * @returns {Promise<any[]>}
   */
  async listLogs(tenantId, limit) {
    return await notificationsRepository.findLogs(tenantId, limit);
  }
};
