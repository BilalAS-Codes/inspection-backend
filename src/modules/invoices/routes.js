import express from 'express';
import { invoicesController } from './controller.js';
import { mockPayWebhookSchema } from './validations.js';
import { validate } from '../../shared/validate.js';
import { authMiddleware } from '../../shared/auth.js';

const router = express.Router();

/* Authenticated routes */
router.get('/', authMiddleware, invoicesController.getInvoices);
router.post('/', authMiddleware, invoicesController.createInvoice);
router.post('/:id/pay', authMiddleware, invoicesController.pay);

/* Public routes (mock-pay page & webhook) */
router.get('/:id', invoicesController.getInvoice);
router.post('/webhook', validate(mockPayWebhookSchema), invoicesController.mockPayWebhook);

export default router;
