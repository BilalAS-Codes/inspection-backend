import { clientsRepository } from './repository.js';
import { AppError } from '../../shared/errors.js';
import { writeAudit } from '../../shared/audit.js';

/**
 * Service Layer for Corporate Clients.
 */
export const clientsService = {
  /**
   * Lists clients with aggregated operational & commercial totals.
   */
  async listClients(tenantId) {
    return await clientsRepository.findClients(tenantId);
  },

  /**
   * Retrieves complete 360° dossier for a client.
   */
  async getClientDossier(id, tenantId) {
    const dossier = await clientsRepository.findClientDossier(id, tenantId);
    if (!dossier) {
      throw new AppError('NOT_FOUND', 'Client entity not found.', 404);
    }
    return dossier;
  },

  /**
   * Registers a new corporate client.
   */
  async createClient(tenantId, actorUserId, payload) {
    if (!payload.name || !payload.name.trim()) {
      throw new AppError('VALIDATION_FAILED', 'Client name is required.', 400);
    }

    const client = await clientsRepository.createClient(tenantId, payload);

    await writeAudit(null, {
      tenantId,
      actorUserId,
      action: 'client.create',
      entityType: 'client',
      entityId: client.id,
      after: { name: client.name, contactEmail: client.contact_email }
    });

    return client;
  }
};
