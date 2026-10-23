import crypto from 'crypto';
import { invoicesRepository } from './repository.js';
import { withTransaction, query } from '../../db/client.js';
import { AppError } from '../../shared/errors.js';
import { writeAudit } from '../../shared/audit.js';
import { nextSerial, getNextUniqueSerial } from '../../shared/serial.js';
import { computeVat } from '../../shared/money.js';
import { config } from '../../config.js';

/**
 * Service Layer for Invoices and Idempotent Payments.
 */
export const invoicesService = {
  /**
   * Lists invoices for tenant.
   * @param {string} tenantId
   * @returns {Promise<any[]>}
   */
  async listInvoices(tenantId) {
    return await invoicesRepository.findInvoices(tenantId);
  },

  /**
   * Fetches single invoice and payment history.
   * @param {string} id
   * @returns {Promise<{ invoice: object, payments: any[] }>}
   */
  async getInvoiceDetails(id) {
    const invoice = await invoicesRepository.findInvoiceById(id);
    if (!invoice) {
      throw new AppError('NOT_FOUND', 'Invoice not found.', 404);
    }

    const payments = await invoicesRepository.findPaymentsByInvoiceId(id);
    return { invoice, payments };
  },

  /**
   * Initiates payment session with unique idempotency key.
   * @param {string} id
   * @param {string} tenantId
   * @returns {Promise<{ paymentId: string, idempotencyKey: string, redirectUrl: string }>}
   */
  async initiatePayment(id, tenantId) {
    const invoice = await invoicesRepository.findInvoiceById(id);
    if (!invoice || invoice.tenant_id !== tenantId) {
      throw new AppError('NOT_FOUND', 'Invoice not found.', 404);
    }

    if (invoice.status === 'paid') {
      throw new AppError('CONFLICT', 'Invoice has already been paid.', 409);
    }

    const idempotencyKey = crypto.randomUUID();
    const payment = await invoicesRepository.createInitiatedPayment(
      tenantId,
      invoice.id,
      invoice.total,
      invoice.currency,
      idempotencyKey
    );

    return {
      paymentId: payment.id,
      idempotencyKey,
      redirectUrl: `${config.WEB_BASE_URL}/mock-pay/${invoice.id}?pid=${payment.id}`
    };
  },

  /**
   * Processes mock payment webhook idempotently.
   * Guarantees that duplicate requests never create multiple work orders.
   * @param {object} payload
   * @returns {Promise<object>}
   */
  async processMockPaymentWebhook({ paymentId, invoiceId, status, idempotencyKey }) {
    return await withTransaction(async (client) => {
      // 1. Check idempotency
      const existingPay = await invoicesRepository.findPaymentByIdempotencyKey(idempotencyKey, client);
      if (existingPay && existingPay.status === 'succeeded') {
        return { idempotent: true, message: 'Payment was already processed successfully.' };
      }

      // 2. Fetch invoice
      let targetInvoiceId = invoiceId;
      if (!targetInvoiceId && paymentId) {
        const pRes = await client.query('SELECT invoice_id FROM payments WHERE id = $1;', [paymentId]);
        if (pRes.rows.length > 0) targetInvoiceId = pRes.rows[0].invoice_id;
      }

      const invoice = await invoicesRepository.findInvoiceForUpdate(targetInvoiceId, client);
      if (!invoice) {
        throw new AppError('NOT_FOUND', 'Invoice not found.', 404);
      }

      // 3. Upsert payment record
      if (!existingPay) {
        await client.query(`
          INSERT INTO payments (
            tenant_id, invoice_id, gateway, amount, currency, status, idempotency_key
          ) VALUES ($1, $2, 'mock', $3, $4, $5, $6);
        `, [invoice.tenant_id, invoice.id, invoice.total, invoice.currency, status, idempotencyKey]);
      } else {
        await client.query(
          'UPDATE payments SET status = $1 WHERE idempotency_key = $2;',
          [status, idempotencyKey]
        );
      }

      if (status !== 'succeeded') {
        return { idempotent: false, status: 'failed', message: 'Payment simulation marked as failed.' };
      }

      // 4. Mark invoice paid
      await client.query(
        "UPDATE invoices SET status = 'paid' WHERE id = $1 AND status <> 'paid';",
        [invoice.id]
      );

      // 5. Work order creation (idempotent check)
      const existingWo = await client.query(
        'SELECT id, wo_number FROM work_orders WHERE invoice_id = $1;',
        [invoice.id]
      );

      let woNumber;
      let woId;

      if (existingWo.rows.length > 0) {
        woId = existingWo.rows[0].id;
        woNumber = existingWo.rows[0].wo_number;
      } else {
        woNumber = await getNextUniqueSerial(
          client,
          invoice.tenant_id,
          'work_order',
          'work_orders',
          'wo_number',
          'WO-'
        );

        const clientJson = invoice.client_jsonb;
        const lineItems = invoice.line_items_jsonb;
        const scope = lineItems[0]?.description || 'Equipment safety & compliance inspection';

        const insWo = await client.query(`
          INSERT INTO work_orders (
            tenant_id, wo_number, proposal_id, invoice_id, client_name, client_email,
            client_phone, service_type, inspection_category, scope, certificate_validity_days,
            status, due_date
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, 'Regulatory Conformance', 'lifting', $8, 365, 'open',
            CURRENT_DATE + INTERVAL '14 days'
          ) RETURNING id;
        `, [
          invoice.tenant_id,
          woNumber,
          invoice.proposal_id,
          invoice.id,
          clientJson.client_name,
          clientJson.contact_email,
          clientJson.contact_phone,
          scope
        ]);

        woId = insWo.rows[0].id;

        await writeAudit(client, {
          tenantId: invoice.tenant_id,
          actorUserId: null,
          action: 'work_order.create',
          entityType: 'work_order',
          entityId: woId,
          after: { woNumber, invoiceId: invoice.id }
        });
      }

      await writeAudit(client, {
        tenantId: invoice.tenant_id,
        actorUserId: null,
        action: 'invoice.paid',
        entityType: 'invoice',
        entityId: invoice.id,
        after: { status: 'paid', woNumber }
      });

      return {
        idempotent: false,
        status: 'succeeded',
        invoiceNumber: invoice.invoice_number,
        workOrderNumber: woNumber,
        workOrderId: woId
      };
    });
  },

  /**
   * Generates a direct Tax Invoice for a selected Client or Lead.
   * Computes KSA standard 15% VAT, generates ZATCA UUID and SHA-256 hash.
   *
   * @param {string} tenantId - Tenant identifier
   * @param {string} actorUserId - User ID creating invoice
   * @param {object} payload - Invoice parameters
   * @returns {Promise<any>} Created invoice
   */
  async createDirectInvoice(tenantId, actorUserId, {
    clientId, leadId, clientName, clientEmail, clientPhone, subtotal, description
  }) {
    if (!clientName || !clientName.trim()) {
      throw new AppError('VALIDATION_FAILED', 'Client name is required.', 400);
    }

    const cleanSubtotal = Number(subtotal);
    if (isNaN(cleanSubtotal) || cleanSubtotal <= 0) {
      throw new AppError('VALIDATION_FAILED', 'A valid positive subtotal is required.', 400);
    }

    const { vatAmount, total } = computeVat(cleanSubtotal, config.VAT_RATE || 0.15);

    return await withTransaction(async (client) => {
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
        subtotal: cleanSubtotal,
        vatAmount,
        total,
        uuid: zatcaUuid
      });
      const zatcaHash = crypto.createHash('sha256').update(zatcaPayload).digest('hex');

      const clientJson = {
        client_name: clientName.trim(),
        client_email: clientEmail || '',
        client_phone: clientPhone || '',
        lead_id: leadId || null,
        client_id: clientId || null
      };

      const lineItems = [
        {
          description: description || 'Statutory Inspection and Compliance Certification Services',
          quantity: 1,
          unitPrice: cleanSubtotal,
          amount: cleanSubtotal
        }
      ];

      const invoice = await invoicesRepository.createInvoice(client, {
        tenantId,
        invoiceNumber,
        proposalId: null,
        clientJson,
        lineItems,
        subtotal: cleanSubtotal,
        vatAmount,
        total,
        currency: 'SAR',
        status: 'issued',
        zatcaUuid,
        zatcaHash,
        zatcaStatus: 'stubbed'
      });

      if (leadId) {
        await client.query(`
          UPDATE leads
          SET status = 'converted', updated_at = now()
          WHERE id = $1 AND tenant_id = $2;
        `, [leadId, tenantId]);
      }

      await writeAudit(client, {
        tenantId,
        actorUserId,
        action: 'invoice.create_direct',
        entityType: 'invoice',
        entityId: invoice.id,
        after: {
          invoiceNumber: invoice.invoice_number,
          clientName: clientName.trim(),
          total
        }
      });

      return invoice;
    });
  }
};
