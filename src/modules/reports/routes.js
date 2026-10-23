import express from 'express';
import { authMiddleware } from '../../shared/auth.js';
import { reportsController } from './controller.js';

const router = express.Router();
router.use(authMiddleware);

/**
 * @openapi
 * /api/reports/kpi:
 *   get:
 *     tags:
 *       - Reports
 *     summary: Get dashboard KPIs
 *     description: Computes operational overview metrics (open work orders, expiring credentials, revenue this month, jobs completed today).
 *     responses:
 *       200:
 *         description: Dashboard KPI summary object.
 */
router.get('/kpi', reportsController.getKpi);

/**
 * @openapi
 * /api/reports/by-engineer:
 *   get:
 *     tags:
 *       - Reports
 *     summary: Export engineer performance CSV
 *     description: Generates and downloads a CSV report of engineer work order completion statistics. Protected with 30s statement timeout.
 *     responses:
 *       200:
 *         description: CSV file download.
 */
router.get('/by-engineer', reportsController.getByEngineer);

/**
 * @openapi
 * /api/reports/by-client:
 *   get:
 *     tags:
 *       - Reports
 *     summary: Export client billing CSV
 *     description: Generates and downloads a CSV report of client invoiced and paid revenues.
 *     responses:
 *       200:
 *         description: CSV file download.
 */
router.get('/by-client', reportsController.getByClient);

/**
 * @openapi
 * /api/reports/by-branch:
 *   get:
 *     tags:
 *       - Reports
 *     summary: Export branch / operational location report
 *     description: Generates and downloads a report of inspection jobs grouped by branch/site location. Supports format (csv, excel, pdf, json) and date range filtering.
 *     parameters:
 *       - name: format
 *         in: query
 *         required: false
 *         schema:
 *           type: string
 *           enum: [csv, excel, pdf, json]
 *           default: csv
 *       - name: startDate
 *         in: query
 *         required: false
 *         schema:
 *           type: string
 *           format: date
 *       - name: endDate
 *         in: query
 *         required: false
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Report file download or JSON payload.
 */
router.get('/by-branch', reportsController.getByBranch);

/**
 * @openapi
 * /api/reports/by-category:
 *   get:
 *     tags:
 *       - Reports
 *     summary: Export equipment classification report
 *     description: Generates and downloads an inspection report grouped by equipment category (lifting, petroleum, trailer, forklift). Supports format (csv, excel, pdf, json) and date range filtering.
 *     parameters:
 *       - name: format
 *         in: query
 *         required: false
 *         schema:
 *           type: string
 *           enum: [csv, excel, pdf, json]
 *           default: csv
 *       - name: startDate
 *         in: query
 *         required: false
 *         schema:
 *           type: string
 *           format: date
 *       - name: endDate
 *         in: query
 *         required: false
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Report file download or JSON payload.
 */
router.get('/by-category', reportsController.getByCategory);

/**
 * @openapi
 * /api/reports/by-certificate-status:
 *   get:
 *     tags:
 *       - Reports
 *     summary: Get certificate status breakdown
 *     description: Returns certificate counts grouped by status (issued, expired, revoked).
 *     responses:
 *       200:
 *         description: Array of status counts.
 */
router.get('/by-certificate-status', reportsController.getByCertificateStatus);

export default router;

