import { auditRepository } from './repository.js';

/**
 * Service Layer for Audit Log inspection.
 */
export const auditService = {
  /**
   * Retrieves audit logs for the specified tenant matching search criteria.
   * @param {string} tenantId
   * @param {object} filters
   * @returns {Promise<any[]>}
   */
  async getAuditLogs(tenantId, filters) {
    return await auditRepository.findAuditLogs(tenantId, filters);
  }
};
