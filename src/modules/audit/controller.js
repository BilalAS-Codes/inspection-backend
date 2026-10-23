import { auditService } from './services.js';
import { listAuditLogsSchema } from './validations.js';

/**
 * Controller Layer for Audit Log inspection endpoints.
 */
export const auditController = {
  /**
   * GET /api/audit-logs
   * Fetches recent immutable audit log records.
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  async listAuditLogs(req, res, next) {
    try {
      const filters = listAuditLogsSchema.parse(req.query);
      const auditLogs = await auditService.getAuditLogs(req.tenantId, filters);
      return res.status(200).json({ auditLogs });
    } catch (err) {
      next(err);
    }
  }
};
