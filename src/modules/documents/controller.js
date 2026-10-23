import { documentsService } from './services.js';
import { uploadDocumentSchema } from './validations.js';

/**
 * Controller layer for Document Vault management.
 */
export const documentsController = {
  /**
   * GET /api/documents
   * Lists documents with optional category and expiringInDays filters.
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  async listDocuments(req, res, next) {
    try {
      const documents = await documentsService.listDocuments(req.tenantId, req.query);
      return res.status(200).json({ documents });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/documents
   * Multipart upload creating a new document and initial version.
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  async uploadDocument(req, res, next) {
    try {
      // Validate metadata body
      uploadDocumentSchema.parse(req.body);
      const document = await documentsService.uploadDocument(
        req.tenantId,
        req.user.id,
        req.body,
        req.file
      );
      return res.status(201).json({ document });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/documents/:id/versions
   * Uploads an incremental version for an existing document.
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  async uploadNewVersion(req, res, next) {
    try {
      const document = await documentsService.uploadNewVersion(
        req.params.id,
        req.tenantId,
        req.user.id,
        req.file
      );
      return res.status(201).json({ document });
    } catch (err) {
      next(err);
    }
  },

  /**
   * DELETE /api/documents/:id
   * Soft deletes / archives a document with active engineer check.
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  async deleteDocument(req, res, next) {
    try {
      const result = await documentsService.deleteDocument(
        req.params.id,
        req.tenantId,
        req.user.id
      );
      return res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }
};
