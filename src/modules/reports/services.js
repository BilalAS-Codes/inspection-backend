import { reportsRepository } from './repository.js';
import { renderTableReportPdf } from '../../shared/pdf.js';

/**
 * Formats a date range for display in report headers.
 * @param {object} filters
 * @returns {string}
 */
function formatDateRangeLabel(filters = {}) {
  if (filters.startDate && filters.endDate) {
    return `${filters.startDate} to ${filters.endDate}`;
  }
  if (filters.startDate) return `From ${filters.startDate}`;
  if (filters.endDate) return `Until ${filters.endDate}`;
  return 'All Time';
}

/**
 * Service Layer for KPI aggregation and multi-format report exports (JSON, CSV, Excel, PDF).
 */
export const reportsService = {
  /**
   * Returns executive high-level KPIs.
   * @param {string} tenantId - Unique identifier of the tenant
   * @returns {Promise<any>}
   */
  async getKpis(tenantId) {
    return await reportsRepository.findKpiMetrics(tenantId);
  },

  /**
   * Generates Engineer Inspection Performance Report in requested format.
   * @param {string} tenantId - Unique identifier of the tenant
   * @param {object} [filters={}] - Optional date filters
   * @param {'json'|'csv'|'excel'|'pdf'} [format='csv'] - Output format
   * @returns {Promise<any>}
   */
  async getEngineerPerformance(tenantId, filters = {}, format = 'csv') {
    const rows = await reportsRepository.findEngineerPerformance(tenantId, filters);

    if (format === 'json') return rows;

    if (format === 'pdf') {
      return await renderTableReportPdf({
        title: 'Engineer Inspection Performance Report',
        subtitle: 'Musadaqah Business Solution · Inspection Management System',
        dateRange: formatDateRangeLabel(filters),
        columns: [
          { header: 'Engineer Name', width: 140 },
          { header: 'Email Address', width: 170 },
          { header: 'Completed', width: 65 },
          { header: 'In Progress', width: 70 },
          { header: 'Total Assigned', width: 75 }
        ],
        rows: rows.map(r => [
          r.engineer_name,
          r.engineer_email,
          r.jobs_completed,
          r.jobs_in_progress,
          r.total_assigned
        ])
      });
    }

    // CSV or Excel
    let csv = 'Engineer Name,Email,Jobs Completed,Jobs In Progress,Total Assigned\n';
    for (const r of rows) {
      csv += `"${r.engineer_name}","${r.engineer_email}",${r.jobs_completed},${r.jobs_in_progress},${r.total_assigned}\n`;
    }

    if (format === 'excel') {
      return '\ufeff' + csv; // UTF-8 BOM ensures seamless Excel opening
    }
    return csv;
  },

  /**
   * Generates Client Billing and Revenue Audit Report in requested format.
   * @param {string} tenantId - Unique identifier of the tenant
   * @param {object} [filters={}] - Optional date filters
   * @param {'json'|'csv'|'excel'|'pdf'} [format='csv'] - Output format
   * @returns {Promise<any>}
   */
  async getClientBilling(tenantId, filters = {}, format = 'csv') {
    const rows = await reportsRepository.findClientBilling(tenantId, filters);

    if (format === 'json') return rows;

    if (format === 'pdf') {
      return await renderTableReportPdf({
        title: 'Client Billing & Revenue Audit Report',
        subtitle: 'Musadaqah Business Solution · Statutory Financial Ledger',
        dateRange: formatDateRangeLabel(filters),
        columns: [
          { header: 'Client Organization', width: 170 },
          { header: 'Invoices', width: 60 },
          { header: 'Paid Revenue (SAR)', width: 100 },
          { header: 'Outstanding (SAR)', width: 100 },
          { header: 'Total Billed (SAR)', width: 90 }
        ],
        rows: rows.map(r => [
          r.client_name || 'N/A',
          r.total_invoices,
          Number(r.paid_revenue).toLocaleString('en-US', { minimumFractionDigits: 2 }),
          Number(r.outstanding_revenue).toLocaleString('en-US', { minimumFractionDigits: 2 }),
          Number(r.total_billed).toLocaleString('en-US', { minimumFractionDigits: 2 })
        ])
      });
    }

    let csv = 'Client Name,Total Invoices,Paid Revenue (SAR),Outstanding (SAR),Total Billed (SAR)\n';
    for (const r of rows) {
      csv += `"${r.client_name || 'N/A'}",${r.total_invoices},${Number(r.paid_revenue).toFixed(2)},${Number(r.outstanding_revenue).toFixed(2)},${Number(r.total_billed).toFixed(2)}\n`;
    }

    if (format === 'excel') {
      return '\ufeff' + csv;
    }
    return csv;
  },

  /**
   * Generates Branch / Location Workload Report in requested format.
   * @param {string} tenantId - Unique identifier of the tenant
   * @param {object} [filters={}] - Optional date filters
   * @param {'json'|'csv'|'excel'|'pdf'} [format='csv'] - Output format
   * @returns {Promise<any>}
   */
  async getBranchPerformance(tenantId, filters = {}, format = 'csv') {
    const rows = await reportsRepository.findBranchPerformance(tenantId, filters);

    if (format === 'json') return rows;

    if (format === 'pdf') {
      return await renderTableReportPdf({
        title: 'Branch & Operational Location Workload Report',
        subtitle: 'Musadaqah Business Solution · Geographic Operations',
        dateRange: formatDateRangeLabel(filters),
        columns: [
          { header: 'Branch / Site Location', width: 200 },
          { header: 'Total Jobs', width: 70 },
          { header: 'Completed', width: 65 },
          { header: 'In Progress', width: 70 },
          { header: 'Open', width: 55 },
          { header: 'Clients', width: 60 }
        ],
        rows: rows.map(r => [
          r.branch_location,
          r.total_jobs,
          r.completed_jobs,
          r.in_progress_jobs,
          r.open_jobs,
          r.clients_served
        ])
      });
    }

    let csv = 'Branch Location,Total Jobs,Completed Jobs,In Progress Jobs,Open Jobs,Clients Served\n';
    for (const r of rows) {
      csv += `"${r.branch_location}",${r.total_jobs},${r.completed_jobs},${r.in_progress_jobs},${r.open_jobs},${r.clients_served}\n`;
    }

    if (format === 'excel') {
      return '\ufeff' + csv;
    }
    return csv;
  },

  /**
   * Generates Equipment Category Inspection Report in requested format.
   * @param {string} tenantId - Unique identifier of the tenant
   * @param {object} [filters={}] - Optional date filters
   * @param {'json'|'csv'|'excel'|'pdf'} [format='csv'] - Output format
   * @returns {Promise<any>}
   */
  async getCategoryPerformance(tenantId, filters = {}, format = 'csv') {
    const rows = await reportsRepository.findCategoryPerformance(tenantId, filters);

    if (format === 'json') return rows;

    if (format === 'pdf') {
      return await renderTableReportPdf({
        title: 'Equipment Classification & Compliance Report',
        subtitle: 'Musadaqah Business Solution · Technical Asset Categories',
        dateRange: formatDateRangeLabel(filters),
        columns: [
          { header: 'Equipment Category', width: 140 },
          { header: 'Work Orders', width: 75 },
          { header: 'Inspections', width: 75 },
          { header: 'Safe (Passed)', width: 80 },
          { header: 'Unsafe (Failed)', width: 80 },
          { header: 'Certs Issued', width: 70 }
        ],
        rows: rows.map(r => [
          r.category.toUpperCase(),
          r.total_work_orders,
          r.total_inspections,
          r.safe_inspections,
          r.unsafe_inspections,
          r.certificates_issued
        ])
      });
    }

    let csv = 'Equipment Category,Total Work Orders,Total Inspections,Safe Inspections,Unsafe Inspections,Certificates Issued\n';
    for (const r of rows) {
      csv += `"${r.category}",${r.total_work_orders},${r.total_inspections},${r.safe_inspections},${r.unsafe_inspections},${r.certificates_issued}\n`;
    }

    if (format === 'excel') {
      return '\ufeff' + csv;
    }
    return csv;
  },

  /**
   * Returns certificate counts grouped by status.
   * @param {string} tenantId - Unique identifier of the tenant
   * @returns {Promise<any[]>}
   */
  async getCertificateStatusBreakdown(tenantId) {
    return await reportsRepository.findCertificateStatusBreakdown(tenantId);
  }
};

