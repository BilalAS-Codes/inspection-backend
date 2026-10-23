import { reportsService } from './services.js';

/**
 * Controller Layer for executive dashboards and reporting exports.
 */
export const reportsController = {
  /**
   * GET /api/reports/kpi
   * Returns executive high-level KPI cards.
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  async getKpi(req, res, next) {
    try {
      const kpis = await reportsService.getKpis(req.tenantId);
      return res.status(200).json(kpis);
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/reports/by-engineer
   * Streams engineer performance report in CSV, Excel, PDF, or JSON.
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  async getByEngineer(req, res, next) {
    try {
      const { format = 'csv', startDate, endDate } = req.query;
      const data = await reportsService.getEngineerPerformance(req.tenantId, { startDate, endDate }, format);

      if (format === 'json') {
        return res.status(200).json({ data });
      }

      if (format === 'pdf') {
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="engineer_performance_report.pdf"');
        return res.send(data);
      }

      const ext = format === 'excel' ? 'csv' : 'csv';
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="engineer_performance_report.${ext}"`);
      return res.send(data);
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/reports/by-client
   * Streams client billing report in CSV, Excel, PDF, or JSON.
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  async getByClient(req, res, next) {
    try {
      const { format = 'csv', startDate, endDate } = req.query;
      const data = await reportsService.getClientBilling(req.tenantId, { startDate, endDate }, format);

      if (format === 'json') {
        return res.status(200).json({ data });
      }

      if (format === 'pdf') {
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="client_billing_report.pdf"');
        return res.send(data);
      }

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="client_billing_report.csv"');
      return res.send(data);
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/reports/by-branch
   * Streams branch / operational location report in CSV, Excel, PDF, or JSON.
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  async getByBranch(req, res, next) {
    try {
      const { format = 'csv', startDate, endDate } = req.query;
      const data = await reportsService.getBranchPerformance(req.tenantId, { startDate, endDate }, format);

      if (format === 'json') {
        return res.status(200).json({ data });
      }

      if (format === 'pdf') {
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="branch_workload_report.pdf"');
        return res.send(data);
      }

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="branch_workload_report.csv"');
      return res.send(data);
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/reports/by-category
   * Streams equipment classification report in CSV, Excel, PDF, or JSON.
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  async getByCategory(req, res, next) {
    try {
      const { format = 'csv', startDate, endDate } = req.query;
      const data = await reportsService.getCategoryPerformance(req.tenantId, { startDate, endDate }, format);

      if (format === 'json') {
        return res.status(200).json({ data });
      }

      if (format === 'pdf') {
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="equipment_category_report.pdf"');
        return res.send(data);
      }

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="equipment_category_report.csv"');
      return res.send(data);
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/reports/by-certificate-status
   * Aggregates certificate counts by status.
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  async getByCertificateStatus(req, res, next) {
    try {
      const statusBreakdown = await reportsService.getCertificateStatusBreakdown(req.tenantId);
      return res.status(200).json({ statusBreakdown });
    } catch (err) {
      next(err);
    }
  }
};

