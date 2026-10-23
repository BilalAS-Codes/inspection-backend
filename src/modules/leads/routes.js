import express from 'express';
import { leadsController } from './controller.js';
import { createLeadSchema, updateStatusSchema } from './validations.js';
import { validate } from '../../shared/validate.js';
import { authMiddleware } from '../../shared/auth.js';

const router = express.Router();
router.use(authMiddleware);

/**
 * Route declarations for Leads module.
 */
router.get('/', leadsController.getLeads);
router.post('/', validate(createLeadSchema), leadsController.createLead);
router.patch('/:id/status', validate(updateStatusSchema), leadsController.updateStatus);
router.post('/:id/convert', leadsController.convert);

export default router;
