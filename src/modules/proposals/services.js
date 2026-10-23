import crypto from 'crypto';
import { proposalsRepository } from './repository.js';
import { AppError } from '../../shared/errors.js';
import { writeAudit } from '../../shared/audit.js';
import { nextSerial, getNextUniqueSerial } from '../../shared/serial.js';
import { computeVat } from '../../shared/money.js';
import { storage } from '../../shared/storage.js';
import { renderProposalPdf } from '../../shared/pdf.js';
import { withTransaction, query } from '../../db/client.js';
import { config } from '../../config.js';

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Service Layer for Proposals handling template compilation, PDF rendering, secure token generation, and digital acceptance.
 */
export const proposalsService = {
  /**
   * Lists proposals with public file URLs.
   * @param {string} tenantId
   * @returns {Promise<any[]>}
   */
  async listProposals(tenantId) {
    const rows = await proposalsRepository.findProposals(tenantId);
    return rows.map(row => ({
      ...row,
      pdfUrl: row.pdf_key ? storage.publicUrl(row.pdf_key) : null
    }));
  },

  /**
   * Creates draft proposal validating that all template placeholders are resolved.
   * @param {string} tenantId
   * @param {string} actorUserId
   * @param {object} payload
   * @returns {Promise<any>}
   */
  async createProposal(tenantId, actorUserId, { leadId, type, variables }) {
    const template = await proposalsRepository.findTemplate(tenantId, type);
    if (!template) {
      throw new AppError('NOT_FOUND', `Proposal template for type '${type}' not found.`, 404);
    }

    const matches = template.body_html.match(/\{\{([a-zA-Z0-9_]+)\}\}/g) || [];
    const requiredKeys = Array.from(new Set(matches.map(m => m.replace(/[\{\}]/g, ''))));

    const missing = [];
    for (const key of requiredKeys) {
      if (variables[key] === undefined || variables[key] === null || variables[key] === '') {
        missing.push(key);
      }
    }

    if (missing.length > 0) {
      throw new AppError(
        'VALIDATION_FAILED',
        `Missing required proposal template variables: ${missing.join(', ')}`,
        422,
        { missing }
      );
    }

    const proposal = await proposalsRepository.createProposal(tenantId, leadId, type, variables);

    await writeAudit(query, {
      tenantId,
      actorUserId,
      action: 'proposal.create',
      entityType: 'proposal',
      entityId: proposal.id,
      after: proposal
    });

    return proposal;
  },

  /**
   * Renders PDF, uploads to storage, and generates 32-byte public access token.
   * @param {string} id
   * @param {string} tenantId
   * @param {string} actorUserId
   * @returns {Promise<{ clientLink: string, expiresAt: string }>}
   */
  async sendProposal(id, tenantId, actorUserId) {
    const proposal = await proposalsRepository.findProposalById(id, tenantId);
    if (!proposal) {
      throw new AppError('NOT_FOUND', 'Proposal not found.', 404);
    }

    const content = proposal.content_jsonb;

    // Render PDF
    let pdfBuffer;
    try {
      pdfBuffer = await renderProposalPdf({
        proposalId: proposal.id,
        clientName: content.client_name,
        scope: content.scope,
        amount: content.amount,
        currency: content.currency || 'SAR',
        validityDays: content.validity_days || 30,
        type: proposal.type
      });
    } catch (pdfErr) {
      console.error('[Proposal PDF Error]', pdfErr);
      throw new AppError('INTERNAL', 'Failed to generate proposal PDF.', 500);
    }

    // Upload to local storage
    const storageKey = `proposals/${tenantId}/${proposal.id}.pdf`;
    try {
      await storage.put(storageKey, pdfBuffer, 'application/pdf');
    } catch (uploadErr) {
      console.error('[Storage Error]', uploadErr);
      await query("UPDATE proposals SET status = 'draft' WHERE id = $1;", [proposal.id]);
      throw new AppError('INTERNAL', 'Failed to upload proposal PDF.', 500);
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashToken(rawToken);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await proposalsRepository.markProposalSent(proposal.id, tenantId, storageKey, tokenHash, expiresAt.toISOString());

    await writeAudit(query, {
      tenantId,
      actorUserId,
      action: 'proposal.send',
      entityType: 'proposal',
      entityId: proposal.id,
      after: { status: 'sent', expiresAt }
    });

    const clientLink = `${config.WEB_BASE_URL}/proposal/${rawToken}`;
    return {
      clientLink,
      expiresAt: expiresAt.toISOString()
    };
  },

  /**
   * Retrieves proposal data for public viewing via token.
   * @param {string} token
   * @returns {Promise<object>}
   */
  async getPublicProposal(token) {
    const tokenHash = hashToken(token);
    const proposal = await proposalsRepository.findByTokenHash(tokenHash);
    if (!proposal) {
      throw new AppError('NOT_FOUND', 'Proposal link not found or invalid.', 404);
    }

    if (new Date(proposal.access_token_expires_at) < new Date()) {
      throw new AppError('GONE', 'This proposal link has expired.', 410, {
        expiredAt: proposal.access_token_expires_at
      });
    }

    return {
      proposal: {
        id: proposal.id,
        type: proposal.type,
        status: proposal.status,
        content: proposal.content_jsonb,
        acceptedAt: proposal.accepted_at,
        acceptedByEmail: proposal.accepted_by_email,
        expiresAt: proposal.access_token_expires_at,
        tenant: {
          name: proposal.tenant_name,
          address: proposal.tenant_address,
          vatNumber: proposal.tenant_vat
        }
      },
      pdfUrl: proposal.pdf_key ? storage.publicUrl(proposal.pdf_key) : null
    };
  },

  /**
   * Digitally accepts proposal, creates Tax Invoice with 15% VAT, and transitions lead to converted.
   * @param {string} token
   * @param {string} email
   * @returns {Promise<{ invoiceNumber: string, invoiceId: string }>}
   */
  async acceptPublicProposal(token, email) {
    const tokenHash = hashToken(token);

    return await withTransaction(async (client) => {
      const updRes = await client.query(`
        UPDATE proposals
        SET accepted_at = now(),
            accepted_by_email = $1,
            status = 'accepted'
        WHERE access_token_hash = $2
          AND accepted_at IS NULL
          AND access_token_expires_at > now()
        RETURNING *;
      `, [email, tokenHash]);

      if (updRes.rows.length === 0) {
        const checkRes = await client.query(
          'SELECT accepted_at, access_token_expires_at FROM proposals WHERE access_token_hash = $1;',
          [tokenHash]
        );

        if (checkRes.rows.length === 0) {
          throw new AppError('NOT_FOUND', 'Proposal not found.', 404);
        }

        const existing = checkRes.rows[0];
        if (existing.accepted_at) {
          throw new AppError('CONFLICT', 'This proposal has already been digitally accepted.', 409, {
            acceptedAt: existing.accepted_at
          });
        }

        if (new Date(existing.access_token_expires_at) <= new Date()) {
          throw new AppError('GONE', 'This proposal link has expired.', 410, {
            expiredAt: existing.access_token_expires_at
          });
        }

        throw new AppError('UNPROCESSABLE', 'Could not process proposal acceptance.', 422);
      }

      const proposal = updRes.rows[0];
      const content = proposal.content_jsonb;
      const subtotal = Number(content.amount) || 0;
      const { vatAmount, total } = computeVat(subtotal, config.VAT_RATE);

      const invoiceNumber = await getNextUniqueSerial(
        client,
        proposal.tenant_id,
        'invoice',
        'invoices',
        'invoice_number',
        'INV-'
      );

      const zatcaUuid = crypto.randomUUID();
      const zatcaPayload = JSON.stringify({
        invoiceNumber,
        subtotal,
        vatAmount,
        total,
        uuid: zatcaUuid
      });
      const zatcaHash = crypto.createHash('sha256').update(zatcaPayload).digest('hex');

      const clientJson = {
        client_name: content.client_name,
        contact_email: email,
        contact_phone: content.contact_phone || ''
      };

      const lineItems = [
        {
          description: content.scope || 'Inspection Services',
          quantity: 1,
          unit_price: subtotal,
          total: subtotal
        }
      ];

      const insInv = await client.query(`
        INSERT INTO invoices (
          tenant_id, invoice_number, proposal_id, client_jsonb, line_items_jsonb,
          subtotal, vat_amount, total, currency, status, zatca_uuid, zatca_hash, zatca_status
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, 'SAR', 'issued', $9, $10, 'stubbed'
        ) RETURNING id, invoice_number;
      `, [
        proposal.tenant_id,
        invoiceNumber,
        proposal.id,
        JSON.stringify(clientJson),
        JSON.stringify(lineItems),
        subtotal,
        vatAmount,
        total,
        zatcaUuid,
        zatcaHash
      ]);

      const invoice = insInv.rows[0];

      if (proposal.lead_id) {
        await client.query(`
          UPDATE leads
          SET status = 'converted', updated_at = now()
          WHERE id = $1;
        `, [proposal.lead_id]);
      }

      await writeAudit(client, {
        tenantId: proposal.tenant_id,
        actorUserId: null,
        action: 'proposal.accept',
        entityType: 'proposal',
        entityId: proposal.id,
        after: {
          acceptedByEmail: email,
          invoiceNumber: invoice.invoice_number,
          invoiceId: invoice.id
        }
      });

      return invoice;
    });
  },

  /**
   * Manually signs and accepts a proposal on behalf of the client (offline/physical agreement),
   * transitioning proposal status to 'accepted', converting any linked lead, and generating the
   * ZATCA-compliant Tax Invoice.
   *
   * @param {string} id - Proposal ID
   * @param {string} tenantId - Tenant identifier
   * @param {string} actorUserId - User ID performing the action
   * @param {object} params - Manual sign details
   * @param {string} [params.signatoryName] - Name of client signatory (e.g. "Eng. Tariq Al-Mansoor")
   * @param {string} [params.signatoryEmail] - Email of client signatory
   * @param {string} [params.poNumber] - Client Purchase Order or physical contract reference
   * @param {string} [params.signingMethod] - e.g. "wet_signature", "purchase_order", "email_approval"
   * @param {string} [params.notes] - Additional audit remarks
   * @returns {Promise<{ proposal: object, invoice: object }>}
   */
  async manualSignProposal(id, tenantId, actorUserId, { signatoryName, signatoryEmail, poNumber, signingMethod = 'wet_signature', notes } = {}) {
    return await withTransaction(async (client) => {
      const propRes = await client.query(`
        SELECT * FROM proposals
        WHERE id = $1 AND tenant_id = $2;
      `, [id, tenantId]);

      if (propRes.rows.length === 0) {
        throw new AppError('NOT_FOUND', 'Proposal not found.', 404);
      }

      const proposal = propRes.rows[0];
      if (proposal.status === 'accepted') {
        throw new AppError('CONFLICT', 'This proposal has already been signed and accepted.', 409);
      }

      const content = proposal.content_jsonb || {};
      const email = signatoryEmail || content.contact_email || 'client@signatory.sa';
      const signer = signatoryName || content.client_name || 'Authorized Client Representative';

      const signatureMetadata = {
        signatoryName: signer,
        signatoryEmail: email,
        poNumber: poNumber || null,
        signingMethod,
        notes: notes || null,
        signedAt: new Date().toISOString(),
        recordedByUserId: actorUserId
      };

      const updatedContent = {
        ...content,
        manual_signature: signatureMetadata,
        signed_by_name: signer
      };

      const updRes = await client.query(`
        UPDATE proposals
        SET status = 'accepted',
            accepted_at = now(),
            accepted_by_email = $1,
            content_jsonb = $2
        WHERE id = $3 AND tenant_id = $4
        RETURNING *;
      `, [email, JSON.stringify(updatedContent), id, tenantId]);

      const updatedProposal = updRes.rows[0];
      const subtotal = Number(content.amount) || 0;
      const { vatAmount, total } = computeVat(subtotal, config.VAT_RATE);

      const invoiceNumber = await getNextUniqueSerial(
        client,
        tenantId,
        'invoice',
        'invoices',
        'invoice_number',
        'INV-'
      );

      const zatcaUuid = crypto.randomUUID();
      const zatcaPayload = JSON.stringify({
        invoiceNumber,
        subtotal,
        vatAmount,
        total,
        uuid: zatcaUuid
      });
      const zatcaHash = crypto.createHash('sha256').update(zatcaPayload).digest('hex');

      const clientJson = {
        client_name: content.client_name,
        contact_email: email,
        contact_phone: content.contact_phone || '',
        po_number: poNumber || ''
      };

      const lineItems = [
        {
          description: content.scope || 'Inspection Services',
          quantity: 1,
          unit_price: subtotal,
          total: subtotal
        }
      ];

      const insInv = await client.query(`
        INSERT INTO invoices (
          tenant_id, invoice_number, proposal_id, client_jsonb, line_items_jsonb,
          subtotal, vat_amount, total, currency, status, zatca_uuid, zatca_hash, zatca_status
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, 'SAR', 'issued', $9, $10, 'stubbed'
        ) RETURNING id, invoice_number;
      `, [
        tenantId,
        invoiceNumber,
        proposal.id,
        JSON.stringify(clientJson),
        JSON.stringify(lineItems),
        subtotal,
        vatAmount,
        total,
        zatcaUuid,
        zatcaHash
      ]);

      const invoice = insInv.rows[0];

      if (proposal.lead_id) {
        await client.query(`
          UPDATE leads
          SET status = 'converted', updated_at = now()
          WHERE id = $1;
        `, [proposal.lead_id]);
      }

      await writeAudit(client, {
        tenantId,
        actorUserId,
        action: 'proposal.manual_sign',
        entityType: 'proposal',
        entityId: proposal.id,
        after: {
          signatoryName: signer,
          signatoryEmail: email,
          signingMethod,
          poNumber,
          invoiceNumber: invoice.invoice_number,
          invoiceId: invoice.id
        }
      });

      return {
        proposal: updatedProposal,
        invoice
      };
    });
  }
};
