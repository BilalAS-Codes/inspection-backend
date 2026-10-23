import express from 'express';
import { workOrdersController } from './controller.js';
import { assignEngineerSchema, updateStatusSchema } from './validations.js';
import { validate } from '../../shared/validate.js';
import { authMiddleware } from '../../shared/auth.js';
import { requireRole } from '../../shared/rbac.js';

const router = express.Router();
router.use(authMiddleware);

/**
 * Route declarations for Work Orders module.
 */
router.get('/', workOrdersController.getWorkOrders);
router.post('/', workOrdersController.createWorkOrder);
router.get('/:id', workOrdersController.getWorkOrder);
router.patch('/:id/assign', validate(assignEngineerSchema), workOrdersController.assignEngineer);
router.patch('/:id/status', validate(updateStatusSchema), workOrdersController.updateStatus);
router.patch('/:id/reopen', requireRole(['admin']), workOrdersController.reopen);
router.get('/:id/checklist', workOrdersController.getChecklist);

export default router;
