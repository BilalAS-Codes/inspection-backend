import express from 'express';
import { authMiddleware } from '../../shared/auth.js';
import { requireRole } from '../../shared/rbac.js';
import { auditController } from './controller.js';

const router = express.Router();
router.use(authMiddleware);
router.use(requireRole(['admin']));

/**
 * @openapi
 * /api/audit-logs:
 *   get:
 *     tags:
 *       - Audit
 *     summary: List audit logs
 *     description: Fetches immutable append-only system audit logs with optional filtering by entity type and date range. Restricted to admin role.
 *     parameters:
 *       - in: query
 *         name: entityType
 *         schema:
 *           type: string
 *         description: Optional entity type filter (e.g. work_order, invoice, certificate).
 *       - in: query
 *         name: from
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Optional start timestamp (ISO 8601).
 *       - in: query
 *         name: to
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Optional end timestamp (ISO 8601).
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 200
 *         description: Maximum number of audit records to return (up to 500).
 *     responses:
 *       200:
 *         description: Array of audit log events.
 *       403:
 *         description: Forbidden - admin role required.
 */
router.get('/', auditController.listAuditLogs);

export default router;
