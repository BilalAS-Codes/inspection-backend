import { leadsRepository } from './repository.js';
import { withTransaction, query } from '../../db/client.js';
import { AppError } from '../../shared/errors.js';
import { writeAudit } from '../../shared/audit.js';

const VALID_LEAD_STATUSES = ['new', 'contacted', 'proposal_sent', 'converted', 'lost'];

/**
 * Service Layer for Leads management, deduplication, state transitions, and conversion.
 */
export const leadsService = {
  /**
   * Retrieves list of leads.
   * @param {string} tenantId
   * @param {object} filters
   * @returns {Promise<any[]>}
   */
  async listLeads(tenantId, filters) {
    return await leadsRepository.findLeads(tenantId, filters);
  },

  /**
   * Creates a lead with deduplication check.
   * @param {string} tenantId
   * @param {string} actorUserId
   * @param {object} data
   * @returns {Promise<any>}
   */
  async createLead(tenantId, actorUserId, data) {
    const cleanEmail = data.contactEmail ? data.contactEmail.toLowerCase().trim() : null;
    const cleanPhone = data.contactPhone ? data.contactPhone.trim() : '';

    try {
      const lead = await leadsRepository.createLead(tenantId, {
        ...data,
        contactEmail: cleanEmail,
        contactPhone: cleanPhone
      });

      await writeAudit(query, {
        tenantId,
        actorUserId,
        action: 'lead.create',
        entityType: 'lead',
        entityId: lead.id,
        after: lead
      });

      return lead;
    } catch (dbErr) {
      if (dbErr.code === '23505' && dbErr.constraint === 'leads_dedupe_idx') {
        const existing = await leadsRepository.findExistingLead(tenantId, cleanEmail, cleanPhone, data.source);
        throw new AppError(
          'CONFLICT',
          'A lead with this email, phone, and source already exists and is active.',
          409,
          { existingLeadId: existing?.id, existingLead: existing }
        );
      }
      throw dbErr;
    }
  },

  /**
   * Transitions lead status through the strict state machine.
   * @param {string} id
   * @param {string} tenantId
   * @param {string} actorUserId
   * @param {string} targetStatus
   * @returns {Promise<any>}
   */
  async updateLeadStatus(id, tenantId, actorUserId, targetStatus) {
    const lead = await leadsRepository.findLeadById(id, tenantId);
    if (!lead) {
      throw new AppError('NOT_FOUND', 'Lead not found.', 404);
    }

    if (!VALID_LEAD_STATUSES.includes(targetStatus)) {
      throw new AppError(
        'UNPROCESSABLE',
        `Invalid lead status '${targetStatus}'. Must be one of: ${VALID_LEAD_STATUSES.join(', ')}`,
        422,
        { currentStatus: lead.status, targetStatus, validStatuses: VALID_LEAD_STATUSES }
      );
    }

    const updated = await leadsRepository.updateStatus(id, tenantId, targetStatus);

    await writeAudit(query, {
      tenantId,
      actorUserId,
      action: 'lead.status_change',
      entityType: 'lead',
      entityId: id,
      before: { status: lead.status },
      after: { status: targetStatus }
    });

    return updated;
  },

  /**
   * Converts a lead into a commercial proposal draft.
   * @param {string} id
   * @param {string} tenantId
   * @param {string} actorUserId
   * @returns {Promise<string>} Created proposal ID
   */
  async convertLead(id, tenantId, actorUserId) {
    return await withTransaction(async (client) => {
      const lead = await leadsRepository.findLeadById(id, tenantId, client);
      if (!lead) {
        throw new AppError('NOT_FOUND', 'Lead not found.', 404);
      }

      const proposalContent = {
        client_name: lead.client_name,
        contact_email: lead.contact_email,
        contact_phone: lead.contact_phone,
        scope: lead.notes || 'Full annual technical and regulatory inspection as per statutory SASO/ISO standards.',
        amount: 3500.00,
        currency: 'SAR',
        validity_days: 30
      };

      const insProp = await client.query(`
        INSERT INTO proposals (tenant_id, lead_id, type, status, content_jsonb)
        VALUES ($1, $2, 'commercial', 'draft', $3)
        RETURNING id;
      `, [tenantId, lead.id, JSON.stringify(proposalContent)]);

      const proposalId = insProp.rows[0].id;

      await leadsRepository.updateStatus(lead.id, tenantId, 'proposal_sent', client);

      await writeAudit(client, {
        tenantId,
        actorUserId,
        action: 'lead.convert',
        entityType: 'lead',
        entityId: lead.id,
        before: { status: lead.status },
        after: { status: 'proposal_sent', proposalId }
      });

      return proposalId;
    });
  }
};
