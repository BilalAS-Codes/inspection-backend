import express from 'express';
import { proposalsController } from './controller.js';
import { createProposalSchema, acceptProposalSchema } from './validations.js';
import { validate } from '../../shared/validate.js';
import { authMiddleware } from '../../shared/auth.js';

const router = express.Router();

/* Authenticated routes */
router.get('/', authMiddleware, proposalsController.getProposals);
router.post('/', authMiddleware, validate(createProposalSchema), proposalsController.createProposal);
router.post('/:id/send', authMiddleware, proposalsController.sendProposal);
router.post('/:id/manual-sign', authMiddleware, proposalsController.manualSignProposal);

/* Public token-gated routes */
router.get('/public/:token', proposalsController.getPublicProposal);
router.post('/public/:token/accept', validate(acceptProposalSchema), proposalsController.acceptPublicProposal);

export default router;
