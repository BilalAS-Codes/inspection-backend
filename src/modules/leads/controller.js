import { leadsService } from './services.js';

/**
 * Controller Layer for Leads HTTP endpoints.
 */
export const leadsController = {
  /**
   * GET /api/leads
   */
  async getLeads(req, res, next) {
    try {
      const { status, source, q } = req.query;
      const leads = await leadsService.listLeads(req.tenantId, { status, source, q });
      return res.status(200).json({ leads });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/leads
   */
  async createLead(req, res, next) {
    try {
      const lead = await leadsService.createLead(req.tenantId, req.user.id, req.body);
      return res.status(201).json({ lead });
    } catch (err) {
      next(err);
    }
  },

  /**
   * PATCH /api/leads/:id/status
   */
  async updateStatus(req, res, next) {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const lead = await leadsService.updateLeadStatus(id, req.tenantId, req.user.id, status);
      return res.status(200).json({ lead });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/leads/:id/convert
   */
  async convert(req, res, next) {
    try {
      const { id } = req.params;
      const proposalId = await leadsService.convertLead(id, req.tenantId, req.user.id);
      return res.status(201).json({ proposalId });
    } catch (err) {
      next(err);
    }
  }
};
