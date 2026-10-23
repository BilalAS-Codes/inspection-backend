import { workOrdersService } from './services.js';

/**
 * Controller Layer for Work Orders HTTP endpoints.
 */
export const workOrdersController = {
  /**
   * GET /api/work-orders
   */
  async getWorkOrders(req, res, next) {
    try {
      const { status } = req.query;
      const workOrders = await workOrdersService.listWorkOrders(req.tenantId, status);
      return res.status(200).json({ workOrders });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/work-orders/:id
   */
  async getWorkOrder(req, res, next) {
    try {
      const { id } = req.params;
      const result = await workOrdersService.getWorkOrderDetails(id, req.tenantId);
      return res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },

  /**
   * PATCH /api/work-orders/:id/assign
   */
  async assignEngineer(req, res, next) {
    try {
      const { id } = req.params;
      const { engineerId } = req.body;
      const workOrder = await workOrdersService.assignEngineerWithGatePass(
        id,
        req.tenantId,
        req.user.id,
        engineerId
      );
      return res.status(200).json({ workOrder });
    } catch (err) {
      next(err);
    }
  },

  /**
   * PATCH /api/work-orders/:id/status
   */
  async updateStatus(req, res, next) {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const workOrder = await workOrdersService.updateStatus(
        id,
        req.tenantId,
        req.user.id,
        status
      );
      return res.status(200).json({ workOrder });
    } catch (err) {
      next(err);
    }
  },

  /**
   * PATCH /api/work-orders/:id/reopen
   */
  async reopen(req, res, next) {
    try {
      const { id } = req.params;
      const workOrder = await workOrdersService.reopenWorkOrder(id, req.tenantId, req.user.id);
      return res.status(200).json({
        message: 'Work order reopened for re-inspection.',
        workOrder
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/work-orders/:id/checklist
   */
  async getChecklist(req, res, next) {
    try {
      const { id } = req.params;
      const checklist = await workOrdersService.getChecklistForWorkOrder(id, req.tenantId);
      return res.status(200).json({ checklist });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/work-orders
   */
  async createWorkOrder(req, res, next) {
    try {
      const workOrder = await workOrdersService.createDirectWorkOrder(req.tenantId, req.user?.id, req.body);
      return res.status(201).json({
        message: `Work Order '${workOrder.wo_number}' created successfully.`,
        workOrder
      });
    } catch (err) {
      next(err);
    }
  }
};
