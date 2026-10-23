import { invoicesService } from './services.js';

/**
 * Controller Layer for Invoices and Payments endpoints.
 */
export const invoicesController = {
  /**
   * GET /api/invoices
   */
  async getInvoices(req, res, next) {
    try {
      const invoices = await invoicesService.listInvoices(req.tenantId);
      return res.status(200).json({ invoices });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/invoices/:id
   */
  async getInvoice(req, res, next) {
    try {
      const { id } = req.params;
      const result = await invoicesService.getInvoiceDetails(id);
      return res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/invoices/:id/pay
   */
  async pay(req, res, next) {
    try {
      const { id } = req.params;
      const result = await invoicesService.initiatePayment(id, req.tenantId);
      return res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/webhooks/mock-pay
   */
  async mockPayWebhook(req, res, next) {
    try {
      const result = await invoicesService.processMockPaymentWebhook(req.body);
      return res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/invoices
   */
  async createInvoice(req, res, next) {
    try {
      const invoice = await invoicesService.createDirectInvoice(req.tenantId, req.user?.id, req.body);
      return res.status(201).json({
        message: `Tax Invoice '${invoice.invoice_number}' issued successfully.`,
        invoice
      });
    } catch (err) {
      next(err);
    }
  }
};
