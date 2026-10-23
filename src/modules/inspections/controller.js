import { inspectionsService } from './services.js';

/**
 * Controller Layer for Inspection submissions.
 */
export const inspectionsController = {
  /**
   * POST /api/inspections
   * Submits an inspection checklist with safety outcome enforcement.
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  async submitInspection(req, res, next) {
    try {
      const submission = await inspectionsService.submitInspection(
        req.tenantId,
        req.user.id,
        req.body
      );
      return res.status(201).json({ submission });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/inspections/work-order/:workOrderId
   * Retrieves inspection details for a work order.
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  async getByWorkOrderId(req, res, next) {
    try {
      const submission = await inspectionsService.getInspectionByWorkOrderId(req.params.workOrderId);
      return res.status(200).json({ submission });
    } catch (err) {
      next(err);
    }
  }
};
