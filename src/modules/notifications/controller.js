import { notificationsService } from './services.js';
import { listLogsSchema } from './validations.js';

/**
 * Controller Layer for Expiry Notifications and Logs.
 */
export const notificationsController = {
  /**
   * POST /api/notifications/run-expiry-scan
   * Executes scheduled or on-demand expiration scans.
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  async runExpiryScan(req, res, next) {
    try {
      const result = await notificationsService.runExpiryScan(req.tenantId, req.user);
      return res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/notifications/logs
   * Retrieves notification log records.
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  async listLogs(req, res, next) {
    try {
      const query = listLogsSchema.parse(req.query);
      const logs = await notificationsService.listLogs(req.tenantId, query.limit);
      return res.status(200).json({ logs });
    } catch (err) {
      next(err);
    }
  }
};
