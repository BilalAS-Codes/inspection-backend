import { clientsService } from './services.js';

/**
 * Controller Layer for Corporate Clients.
 */
export const clientsController = {
  /**
   * GET /api/clients
   */
  async listClients(req, res, next) {
    try {
      const clients = await clientsService.listClients(req.tenantId);
      return res.status(200).json({ clients });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/clients/:id
   */
  async getClientDossier(req, res, next) {
    try {
      const { id } = req.params;
      const dossier = await clientsService.getClientDossier(id, req.tenantId);
      return res.status(200).json(dossier);
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/clients
   */
  async createClient(req, res, next) {
    try {
      const client = await clientsService.createClient(req.tenantId, req.user?.id, req.body);
      return res.status(201).json({
        message: `Client '${client.name}' registered successfully.`,
        client
      });
    } catch (err) {
      next(err);
    }
  }
};
