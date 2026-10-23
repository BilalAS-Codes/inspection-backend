import { proposalsService } from './services.js';

/**
 * Controller Layer for Proposals HTTP endpoints.
 */
export const proposalsController = {
  /**
   * GET /api/proposals
   */
  async getProposals(req, res, next) {
    try {
      const proposals = await proposalsService.listProposals(req.tenantId);
      return res.status(200).json({ proposals });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/proposals
   */
  async createProposal(req, res, next) {
    try {
      const proposal = await proposalsService.createProposal(req.tenantId, req.user.id, req.body);
      return res.status(201).json({ proposal });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/proposals/:id/send
   */
  async sendProposal(req, res, next) {
    try {
      const { id } = req.params;
      const result = await proposalsService.sendProposal(id, req.tenantId, req.user.id);
      return res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/proposals/public/:token
   */
  async getPublicProposal(req, res, next) {
    try {
      const { token } = req.params;
      const result = await proposalsService.getPublicProposal(token);
      return res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/proposals/public/:token/accept
   */
  async acceptPublicProposal(req, res, next) {
    try {
      const { token } = req.params;
      const { email } = req.body;
      const invoice = await proposalsService.acceptPublicProposal(token, email);

      return res.status(200).json({
        message: 'Proposal accepted successfully. Invoice generated.',
        invoiceNumber: invoice.invoice_number,
        invoiceId: invoice.id
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/proposals/:id/manual-sign
   * Records manual offline contract signature and creates the binding Tax Invoice.
   */
  async manualSignProposal(req, res, next) {
    try {
      const { id } = req.params;
      const result = await proposalsService.manualSignProposal(id, req.tenantId, req.user.id, req.body);

      return res.status(200).json({
        message: 'Proposal manually signed and accepted. Tax Invoice generated.',
        proposal: result.proposal,
        invoiceNumber: result.invoice.invoice_number,
        invoiceId: result.invoice.id
      });
    } catch (err) {
      next(err);
    }
  }
};
