import express from 'express';
import { authMiddleware } from '../../shared/auth.js';
import { requireRole } from '../../shared/rbac.js';
import { notificationsController } from './controller.js';

const router = express.Router();
router.use(authMiddleware);

/**
 * @openapi
 * /api/notifications/run-expiry-scan:
 *   post:
 *     tags:
 *       - Notifications
 *     summary: Run automated document and certificate expiry scan
 *     description: Scans all active documents and certificates across 30d, 7d, 1d, and expired intervals. Dispatches alerts and logs with idempotency deduplication.
 *     responses:
 *       200:
 *         description: Scan summary with count of scanned, notified, and deduped items.
 *       403:
 *         description: Forbidden - admin role required.
 */
router.post('/run-expiry-scan', requireRole(['admin']), notificationsController.runExpiryScan);

/**
 * @openapi
 * /api/notifications/logs:
 *   get:
 *     tags:
 *       - Notifications
 *     summary: List notification dispatch logs
 *     description: Retrieves audit trail of sent and attempted notifications. Restricted to admin role.
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Maximum number of logs to return (up to 100).
 *     responses:
 *       200:
 *         description: Array of notification logs.
 */
router.get('/logs', notificationsController.listLogs);

export default router;
