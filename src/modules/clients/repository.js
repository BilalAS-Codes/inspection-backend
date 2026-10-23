import { query } from '../../db/client.js';

/**
 * Data Access Layer for Corporate Clients and 360° Dossier aggregation.
 */
export const clientsRepository = {
  /**
   * Initializes the clients table and syncs existing client records from work orders.
   * Idempotent and safe.
   */
  async ensureClientsTable(tenantId) {
    await query(`
      CREATE TABLE IF NOT EXISTS clients (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id),
        name TEXT NOT NULL,
        cr_number TEXT,
        vat_number TEXT,
        contact_name TEXT,
        contact_email TEXT,
        contact_phone TEXT,
        address TEXT,
        city TEXT DEFAULT 'Riyadh',
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (tenant_id, name)
      );
      CREATE INDEX IF NOT EXISTS clients_tenant_name_idx ON clients (tenant_id, name);
    `);

    // Synchronize unique clients found across work_orders so historic clients are always present
    await query(`
      INSERT INTO clients (tenant_id, name, contact_email, contact_phone, address, city)
      SELECT DISTINCT w.tenant_id, w.client_name, w.client_email, w.client_phone, w.location_text, COALESCE(w.inspection_location, 'Eastern Province')
      FROM work_orders w
      WHERE w.tenant_id = $1 AND w.client_name IS NOT NULL AND w.client_name <> ''
      ON CONFLICT (tenant_id, name) DO NOTHING;
    `, [tenantId]);
  },

  /**
   * Lists all corporate clients with aggregated operational and commercial metrics.
   * @param {string} tenantId - Tenant identifier
   * @returns {Promise<any[]>}
   */
  async findClients(tenantId) {
    await this.ensureClientsTable(tenantId);

    const res = await query(`
      SELECT
        c.id, c.tenant_id, c.name, c.cr_number, c.vat_number, c.contact_name,
        c.contact_email, c.contact_phone, c.address, c.city, c.status, c.notes, c.created_at,
        COUNT(DISTINCT w.id)::int as total_work_orders,
        COUNT(DISTINCT CASE WHEN w.status IN ('open', 'assigned', 'in_progress') THEN w.id END)::int as active_work_orders,
        COUNT(DISTINCT s.id)::int as total_inspections,
        COUNT(DISTINCT cert.id)::int as total_certificates,
        COALESCE(
          (
            SELECT SUM(inv.total)
            FROM invoices inv
            WHERE inv.tenant_id = c.tenant_id
              AND (inv.client_jsonb->>'client_name' ILIKE c.name OR inv.client_jsonb->>'name' ILIKE c.name)
          ), 0
        )::numeric as total_billed_sar
      FROM clients c
      LEFT JOIN work_orders w ON w.tenant_id = c.tenant_id AND (w.client_name ILIKE c.name)
      LEFT JOIN inspection_submissions s ON s.work_order_id = w.id
      LEFT JOIN certificates cert ON cert.work_order_id = w.id
      WHERE c.tenant_id = $1
      GROUP BY c.id
      ORDER BY c.name ASC;
    `, [tenantId]);

    return res.rows;
  },

  /**
   * Retrieves single client profile by ID.
   * @param {string} id - Client UUID
   * @param {string} tenantId - Tenant identifier
   * @returns {Promise<any|null>}
   */
  async findClientById(id, tenantId) {
    await this.ensureClientsTable(tenantId);

    const res = await query(`
      SELECT c.*
      FROM clients c
      WHERE c.id = $1 AND c.tenant_id = $2;
    `, [id, tenantId]);

    return res.rows[0] || null;
  },

  /**
   * Gathers full 360° portfolio for a client: Work Orders, Inspections, Certificates, Invoices, Proposals.
   * @param {string} id - Client UUID
   * @param {string} tenantId - Tenant identifier
   * @returns {Promise<object|null>} Complete dossier
   */
  async findClientDossier(id, tenantId) {
    const client = await this.findClientById(id, tenantId);
    if (!client) return null;

    const clientName = client.name;

    // 1. Work Orders
    const woRes = await query(`
      SELECT w.*, u.name as assigned_engineer_name, u.email as assigned_engineer_email,
             c.certificate_number, c.status as certificate_status,
             s.id as submission_id, s.result as inspection_result
      FROM work_orders w
      LEFT JOIN users u ON w.assigned_engineer_id = u.id
      LEFT JOIN inspection_submissions s ON s.work_order_id = w.id
      LEFT JOIN certificates c ON c.work_order_id = w.id
      WHERE w.tenant_id = $1 AND w.client_name ILIKE $2
      ORDER BY w.created_at DESC;
    `, [tenantId, clientName]);

    // 2. Inspections
    const inspRes = await query(`
      SELECT s.*, w.wo_number, w.client_name, w.inspection_category, w.service_type,
             u.name as engineer_name, u.email as engineer_email,
             c.certificate_number, c.id as certificate_id, c.status as cert_status
      FROM inspection_submissions s
      JOIN work_orders w ON s.work_order_id = w.id
      JOIN users u ON s.engineer_id = u.id
      LEFT JOIN certificates c ON c.work_order_id = w.id
      WHERE w.tenant_id = $1 AND w.client_name ILIKE $2
      ORDER BY s.submitted_at DESC;
    `, [tenantId, clientName]);

    // 3. Certificates
    const certRes = await query(`
      SELECT c.*, w.wo_number, w.client_name
      FROM certificates c
      JOIN work_orders w ON c.work_order_id = w.id
      WHERE c.tenant_id = $1 AND w.client_name ILIKE $2
      ORDER BY c.issued_at DESC;
    `, [tenantId, clientName]);

    // 4. Invoices
    const invRes = await query(`
      SELECT inv.*
      FROM invoices inv
      WHERE inv.tenant_id = $1
        AND (inv.client_jsonb->>'client_name' ILIKE $2 OR inv.client_jsonb->>'name' ILIKE $2)
      ORDER BY inv.created_at DESC;
    `, [tenantId, clientName]);

    // 5. Proposals
    const propRes = await query(`
      SELECT p.*
      FROM proposals p
      WHERE p.tenant_id = $1
        AND (p.content_jsonb->>'client_name' ILIKE $2)
      ORDER BY p.created_at DESC;
    `, [tenantId, clientName]);

    return {
      client,
      workOrders: woRes.rows,
      inspections: inspRes.rows,
      certificates: certRes.rows,
      invoices: invRes.rows,
      proposals: propRes.rows
    };
  },

  /**
   * Creates a new client entity.
   */
  async createClient(tenantId, { name, cr_number, vat_number, contact_name, contact_email, contact_phone, address, city, notes }) {
    await this.ensureClientsTable(tenantId);

    const res = await query(`
      INSERT INTO clients (
        tenant_id, name, cr_number, vat_number, contact_name, contact_email, contact_phone, address, city, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9, 'Riyadh'), $10)
      RETURNING *;
    `, [tenantId, name.trim(), cr_number || null, vat_number || null, contact_name || null, contact_email || null, contact_phone || null, address || null, city, notes || null]);

    return res.rows[0];
  }
};
