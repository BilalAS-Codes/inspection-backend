import { query } from '../../db/client.js';

/**
 * Data Access Layer for Invoices and Payments.
 */
export const invoicesRepository = {
  /**
   * Lists invoices for tenant.
   * @param {string} tenantId
   * @returns {Promise<any[]>}
   */
  async findInvoices(tenantId) {
    const res = await query(`
      SELECT i.id, i.invoice_number, i.proposal_id, i.client_jsonb,
             i.subtotal, i.vat_amount, i.total, i.currency, i.status,
             i.zatca_uuid, i.zatca_status, i.created_at,
             w.id as work_order_id, w.wo_number
      FROM invoices i
      LEFT JOIN work_orders w ON w.invoice_id = i.id
      WHERE i.tenant_id = $1
      ORDER BY i.created_at DESC;
    `, [tenantId]);
    return res.rows;
  },

  /**
   * Finds invoice by ID.
   * @param {string} id
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<any>}
   */
  async findInvoiceById(id, client = null) {
    const q = client ? client.query.bind(client) : query;
    const res = await q(`
      SELECT i.*, t.name as tenant_name, t.vat_number as tenant_vat
      FROM invoices i
      JOIN tenants t ON i.tenant_id = t.id
      WHERE i.id = $1;
    `, [id]);
    return res.rows[0] || null;
  },

  /**
   * Finds invoice with FOR UPDATE lock for payment transaction.
   * @param {string} id
   * @param {import('pg').PoolClient} client
   * @returns {Promise<any>}
   */
  async findInvoiceForUpdate(id, client) {
    const res = await client.query(
      'SELECT * FROM invoices WHERE id = $1 FOR UPDATE;',
      [id]
    );
    return res.rows[0] || null;
  },

  /**
   * Finds payment by idempotency key.
   * @param {string} idempotencyKey
   * @param {import('pg').PoolClient} [client]
   * @returns {Promise<any>}
   */
  async findPaymentByIdempotencyKey(idempotencyKey, client = null) {
    const q = client ? client.query.bind(client) : query;
    const res = await q(
      'SELECT id, status, invoice_id, tenant_id FROM payments WHERE idempotency_key = $1;',
      [idempotencyKey]
    );
    return res.rows[0] || null;
  },

  /**
   * Creates an initiated payment transaction.
   * @param {string} tenantId
   * @param {string} invoiceId
   * @param {number} amount
   * @param {string} currency
   * @param {string} idempotencyKey
   * @returns {Promise<any>}
   */
  async createInitiatedPayment(tenantId, invoiceId, amount, currency, idempotencyKey) {
    const res = await query(`
      INSERT INTO payments (
        tenant_id, invoice_id, gateway, amount, currency, status, idempotency_key
      ) VALUES ($1, $2, 'mock', $3, $4, 'initiated', $5)
      RETURNING id;
    `, [tenantId, invoiceId, amount, currency, idempotencyKey]);
    return res.rows[0];
  },

  /**
   * Fetches payment history for an invoice.
   * @param {string} invoiceId
   * @returns {Promise<any[]>}
   */
  async findPaymentsByInvoiceId(invoiceId) {
    const res = await query(`
      SELECT id, gateway, amount, currency, status, idempotency_key, created_at
      FROM payments
      WHERE invoice_id = $1
      ORDER BY created_at DESC;
    `, [invoiceId]);
    return res.rows;
  },

  /**
   * Inserts a new statutory invoice into the ledger.
   */
  async createInvoice(client, {
    tenantId, invoiceNumber, proposalId = null, clientJson, lineItems,
    subtotal, vatAmount, total, currency = 'SAR', status = 'issued',
    zatcaUuid, zatcaHash, zatcaStatus = 'stubbed'
  }) {
    const q = client ? client.query.bind(client) : query;
    const res = await q(`
      INSERT INTO invoices (
        tenant_id, invoice_number, proposal_id, client_jsonb, line_items_jsonb,
        subtotal, vat_amount, total, currency, status, zatca_uuid, zatca_hash, zatca_status
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
      ) RETURNING *;
    `, [
      tenantId, invoiceNumber, proposalId,
      JSON.stringify(clientJson), JSON.stringify(lineItems),
      subtotal, vatAmount, total, currency, status,
      zatcaUuid, zatcaHash, zatcaStatus
    ]);
    return res.rows[0];
  }
};
