import { query, pool } from '../../db/client.js';

/**
 * Data Access Layer for KPI calculations and operational reporting queries.
 */
export const reportsRepository = {
  /**
   * Calculates executive dashboard high-level KPIs.
   * @param {string} tenantId
   * @returns {Promise<any>}
   */
  async findKpiMetrics(tenantId) {
    // 1. Open Work Orders
    const woRes = await query(`
      SELECT count(*) as count FROM work_orders
      WHERE tenant_id = $1 AND status IN ('open', 'assigned', 'in_progress');
    `, [tenantId]);

    // 2. Expiring Documents in <= 30 days
    const docRes = await query(`
      SELECT count(*) as count FROM documents
      WHERE tenant_id = $1 AND status <> 'archived'
        AND expiry_date IS NOT NULL
        AND expiry_date <= (CURRENT_DATE + INTERVAL '30 days');
    `, [tenantId]);

    // 3. Expiring Certificates in <= 30 days
    const certRes = await query(`
      SELECT count(*) as count FROM certificates
      WHERE tenant_id = $1 AND status = 'issued'
        AND expires_at <= (now() + INTERVAL '30 days');
    `, [tenantId]);

    // 4. Revenue this month
    const revRes = await query(`
      SELECT COALESCE(SUM(total), 0) as total FROM invoices
      WHERE tenant_id = $1 AND status = 'paid'
        AND created_at >= date_trunc('month', now());
    `, [tenantId]);

    // 5. Jobs completed today
    const completedRes = await query(`
      SELECT count(*) as count FROM work_orders
      WHERE tenant_id = $1 AND status = 'completed'
        AND created_at >= date_trunc('day', now());
    `, [tenantId]);

    return {
      openWorkOrders: Number(woRes.rows[0].count),
      expiringDocuments30d: Number(docRes.rows[0].count),
      expiringCertificates30d: Number(certRes.rows[0].count),
      revenueThisMonth: Number(revRes.rows[0].total),
      jobsCompletedToday: Number(completedRes.rows[0].count)
    };
  },

  /**
   * Retrieves engineer performance breakdown with 30s statement timeout and optional date filters.
   * @param {string} tenantId - Unique identifier of the tenant
   * @param {object} [filters={}] - Date filters
   * @param {string} [filters.startDate] - Start date (YYYY-MM-DD)
   * @param {string} [filters.endDate] - End date (YYYY-MM-DD)
   * @returns {Promise<any[]>}
   */
  async findEngineerPerformance(tenantId, filters = {}) {
    const client = await pool.connect();
    try {
      await client.query("SET LOCAL statement_timeout = '30s';");

      let dateClause = '';
      const params = [tenantId];

      if (filters.startDate) {
        params.push(filters.startDate);
        dateClause += ` AND w.created_at >= $${params.length}::date`;
      }
      if (filters.endDate) {
        params.push(filters.endDate);
        dateClause += ` AND w.created_at <= ($${params.length}::date + INTERVAL '1 day')`;
      }

      const sql = `
        SELECT u.name as engineer_name, u.email as engineer_email,
               COUNT(CASE WHEN w.status IN ('completed', 'closed') THEN 1 END) as jobs_completed,
               COUNT(CASE WHEN w.status = 'in_progress' THEN 1 END) as jobs_in_progress,
               COUNT(w.id) as total_assigned
        FROM users u
        LEFT JOIN work_orders w ON w.assigned_engineer_id = u.id AND w.tenant_id = $1 ${dateClause}
        WHERE u.tenant_id = $1 AND u.role = 'engineer'
        GROUP BY u.id, u.name, u.email
        ORDER BY jobs_completed DESC, total_assigned DESC;
      `;

      const result = await client.query(sql, params);
      return result.rows;
    } finally {
      client.release();
    }
  },

  /**
   * Retrieves client billing summary with 30s statement timeout and optional date filters.
   * @param {string} tenantId - Unique identifier of the tenant
   * @param {object} [filters={}] - Date filters
   * @param {string} [filters.startDate] - Start date (YYYY-MM-DD)
   * @param {string} [filters.endDate] - End date (YYYY-MM-DD)
   * @returns {Promise<any[]>}
   */
  async findClientBilling(tenantId, filters = {}) {
    const client = await pool.connect();
    try {
      await client.query("SET LOCAL statement_timeout = '30s';");

      let dateClause = '';
      const params = [tenantId];

      if (filters.startDate) {
        params.push(filters.startDate);
        dateClause += ` AND i.created_at >= $${params.length}::date`;
      }
      if (filters.endDate) {
        params.push(filters.endDate);
        dateClause += ` AND i.created_at <= ($${params.length}::date + INTERVAL '1 day')`;
      }

      const sql = `
        SELECT i.client_jsonb->>'client_name' as client_name,
               COUNT(i.id) as total_invoices,
               COALESCE(SUM(CASE WHEN i.status = 'paid' THEN i.total ELSE 0 END), 0) as paid_revenue,
               COALESCE(SUM(CASE WHEN i.status = 'issued' THEN i.total ELSE 0 END), 0) as outstanding_revenue,
               COALESCE(SUM(i.total), 0) as total_billed
        FROM invoices i
        WHERE i.tenant_id = $1 ${dateClause}
        GROUP BY i.client_jsonb->>'client_name'
        ORDER BY total_billed DESC;
      `;

      const result = await client.query(sql, params);
      return result.rows;
    } finally {
      client.release();
    }
  },

  /**
   * Retrieves operational workload performance grouped by branch / inspection location.
   * Supports Proposal Module 8: Branch (jobs per location).
   * @param {string} tenantId - Unique identifier of the tenant
   * @param {object} [filters={}] - Date filters
   * @param {string} [filters.startDate] - Start date (YYYY-MM-DD)
   * @param {string} [filters.endDate] - End date (YYYY-MM-DD)
   * @returns {Promise<any[]>}
   */
  async findBranchPerformance(tenantId, filters = {}) {
    const client = await pool.connect();
    try {
      await client.query("SET LOCAL statement_timeout = '30s';");

      let dateClause = '';
      const params = [tenantId];

      if (filters.startDate) {
        params.push(filters.startDate);
        dateClause += ` AND w.created_at >= $${params.length}::date`;
      }
      if (filters.endDate) {
        params.push(filters.endDate);
        dateClause += ` AND w.created_at <= ($${params.length}::date + INTERVAL '1 day')`;
      }

      const sql = `
        SELECT COALESCE(NULLIF(w.inspection_location, ''), NULLIF(w.location_text, ''), 'Central Operating Base') as branch_location,
               COUNT(w.id) as total_jobs,
               COUNT(CASE WHEN w.status IN ('completed', 'closed') THEN 1 END) as completed_jobs,
               COUNT(CASE WHEN w.status = 'in_progress' THEN 1 END) as in_progress_jobs,
               COUNT(CASE WHEN w.status = 'open' THEN 1 END) as open_jobs,
               COUNT(DISTINCT w.client_name) as clients_served
        FROM work_orders w
        WHERE w.tenant_id = $1 ${dateClause}
        GROUP BY branch_location
        ORDER BY total_jobs DESC;
      `;

      const result = await client.query(sql, params);
      return result.rows;
    } finally {
      client.release();
    }
  },

  /**
   * Retrieves performance metrics categorized by equipment classification (lifting, petroleum, trailer, forklift).
   * Supports Proposal Module 8: Category reporting.
   * @param {string} tenantId - Unique identifier of the tenant
   * @param {object} [filters={}] - Date filters
   * @param {string} [filters.startDate] - Start date (YYYY-MM-DD)
   * @param {string} [filters.endDate] - End date (YYYY-MM-DD)
   * @returns {Promise<any[]>}
   */
  async findCategoryPerformance(tenantId, filters = {}) {
    const client = await pool.connect();
    try {
      await client.query("SET LOCAL statement_timeout = '30s';");

      let dateClause = '';
      const params = [tenantId];

      if (filters.startDate) {
        params.push(filters.startDate);
        dateClause += ` AND w.created_at >= $${params.length}::date`;
      }
      if (filters.endDate) {
        params.push(filters.endDate);
        dateClause += ` AND w.created_at <= ($${params.length}::date + INTERVAL '1 day')`;
      }

      const sql = `
        SELECT COALESCE(w.inspection_category, 'general') as category,
               COUNT(w.id) as total_work_orders,
               COUNT(s.id) as total_inspections,
               COUNT(CASE WHEN s.result = 'safe' THEN 1 END) as safe_inspections,
               COUNT(CASE WHEN s.result = 'unsafe' THEN 1 END) as unsafe_inspections,
               COUNT(c.id) as certificates_issued
        FROM work_orders w
        LEFT JOIN inspection_submissions s ON s.work_order_id = w.id
        LEFT JOIN certificates c ON c.work_order_id = w.id
        WHERE w.tenant_id = $1 ${dateClause}
        GROUP BY category
        ORDER BY total_work_orders DESC;
      `;

      const result = await client.query(sql, params);
      return result.rows;
    } finally {
      client.release();
    }
  },

  /**
   * Computes certificate count grouped by status.
   * @param {string} tenantId - Unique identifier of the tenant
   * @returns {Promise<any[]>}
   */
  async findCertificateStatusBreakdown(tenantId) {
    const result = await query(`
      SELECT status, count(*) as count
      FROM certificates
      WHERE tenant_id = $1
      GROUP BY status;
    `, [tenantId]);
    return result.rows;
  }
};

