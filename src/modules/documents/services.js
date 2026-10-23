import { documentsRepository } from './repository.js';
import { withTransaction, query } from '../../db/client.js';
import { AppError } from '../../shared/errors.js';
import { writeAudit } from '../../shared/audit.js';
import { storage, validateMagicBytes } from '../../shared/storage.js';

/**
 * Service Layer for Document Vault management, magic-byte inspection, versioning, and deletion protection.
 */
export const documentsService = {
  /**
   * Lists documents with resolved public URLs.
   * @param {string} tenantId
   * @param {object} filters
   * @returns {Promise<any[]>}
   */
  async listDocuments(tenantId, filters) {
    const rows = await documentsRepository.findDocuments(tenantId, filters);
    return rows.map(row => ({
      ...row,
      fileUrl: row.storage_key ? storage.publicUrl(row.storage_key) : null
    }));
  },

  /**
   * Uploads initial document and v1 version.
   * Enforces 0-byte check, magic bytes validation, and past-expiry constraints.
   * @param {string} tenantId
   * @param {string} actorUserId
   * @param {object} metadata
   * @param {Express.Multer.File} file
   * @returns {Promise<any>}
   */
  async uploadDocument(tenantId, actorUserId, metadata, file) {
    if (!file) {
      throw new AppError('VALIDATION_FAILED', 'File upload is required.', 422);
    }
    if (file.size <= 0) {
      throw new AppError('VALIDATION_FAILED', 'Uploaded file cannot be empty (0 bytes).', 422);
    }

    // Inspect binary magic bytes
    validateMagicBytes(file.buffer);

    const { category, documentType, displayName, expiryDate, ownerUserId, allowPastExpiry } = metadata;

    if (expiryDate) {
      const exp = new Date(expiryDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (exp < today && allowPastExpiry !== 'true' && allowPastExpiry !== true) {
        throw new AppError(
          'VALIDATION_FAILED',
          'Expiry date cannot be in the past.',
          422,
          { expiryDate, reason: 'past_expiry_disallowed' }
        );
      }
    }

    return await withTransaction(async (client) => {
      const isExpired = expiryDate && new Date(expiryDate) < new Date();
      const status = isExpired ? 'expired' : 'active';

      const insDoc = await client.query(`
        INSERT INTO documents (
          tenant_id, category, owner_user_id, document_type, display_name, expiry_date, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *;
      `, [
        tenantId,
        category,
        category === 'engineer' ? ownerUserId : null,
        documentType,
        displayName,
        expiryDate || null,
        status
      ]);

      const doc = insDoc.rows[0];
      const storageKey = `documents/${tenantId}/${doc.id}/${Date.now()}_${file.originalname}`;
      await storage.put(storageKey, file.buffer, file.mimetype);

      const insVer = await client.query(`
        INSERT INTO document_versions (
          document_id, version_number, storage_key, file_name, mime_type, file_size, uploaded_by
        ) VALUES ($1, 1, $2, $3, $4, $5, $6)
        RETURNING *;
      `, [doc.id, storageKey, file.originalname, file.mimetype, file.size, actorUserId]);

      const version = insVer.rows[0];
      await client.query('UPDATE documents SET current_version_id = $1 WHERE id = $2;', [version.id, doc.id]);

      await writeAudit(client, {
        tenantId,
        actorUserId,
        action: 'document.upload',
        entityType: 'document',
        entityId: doc.id,
        after: { displayName, documentType, version: 1 }
      });

      return {
        ...doc,
        current_version_id: version.id,
        version_number: 1,
        file_name: version.file_name,
        fileUrl: storage.publicUrl(storageKey)
      };
    });
  },

  /**
   * Uploads an incremental version for an existing document.
   * Serialized with SELECT ... FOR UPDATE.
   * @param {string} id
   * @param {string} tenantId
   * @param {string} actorUserId
   * @param {Express.Multer.File} file
   * @returns {Promise<any>}
   */
  async uploadNewVersion(id, tenantId, actorUserId, file) {
    if (!file) {
      throw new AppError('VALIDATION_FAILED', 'File upload is required.', 422);
    }
    if (file.size <= 0) {
      throw new AppError('VALIDATION_FAILED', 'Uploaded file cannot be empty.', 422);
    }

    validateMagicBytes(file.buffer);

    return await withTransaction(async (client) => {
      const docRes = await client.query(
        'SELECT * FROM documents WHERE id = $1 AND tenant_id = $2 FOR UPDATE;',
        [id, tenantId]
      );

      if (docRes.rows.length === 0) {
        throw new AppError('NOT_FOUND', 'Document not found.', 404);
      }

      const doc = docRes.rows[0];
      const verRes = await client.query(
        'SELECT COALESCE(MAX(version_number), 0) as max_v FROM document_versions WHERE document_id = $1;',
        [id]
      );
      const nextVersion = Number(verRes.rows[0].max_v) + 1;

      const storageKey = `documents/${tenantId}/${doc.id}/${Date.now()}_v${nextVersion}_${file.originalname}`;
      await storage.put(storageKey, file.buffer, file.mimetype);

      const insVer = await client.query(`
        INSERT INTO document_versions (
          document_id, version_number, storage_key, file_name, mime_type, file_size, uploaded_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *;
      `, [doc.id, nextVersion, storageKey, file.originalname, file.mimetype, file.size, actorUserId]);

      const version = insVer.rows[0];
      await client.query('UPDATE documents SET current_version_id = $1 WHERE id = $2;', [version.id, doc.id]);

      await writeAudit(client, {
        tenantId,
        actorUserId,
        action: 'document.version_upload',
        entityType: 'document',
        entityId: doc.id,
        after: { versionNumber: nextVersion, fileName: file.originalname }
      });

      return {
        ...doc,
        current_version_id: version.id,
        version_number: nextVersion,
        file_name: version.file_name,
        fileUrl: storage.publicUrl(storageKey)
      };
    });
  },

  /**
   * Deletes document with active engineer work order conflict check.
   * @param {string} id
   * @param {string} tenantId
   * @param {string} actorUserId
   * @returns {Promise<any>}
   */
  async deleteDocument(id, tenantId, actorUserId) {
    const doc = await documentsRepository.findDocumentById(id, tenantId);
    if (!doc) {
      throw new AppError('NOT_FOUND', 'Document not found.', 404);
    }

    if (doc.category === 'engineer' && doc.owner_user_id) {
      const gatePassTypes = ['IQAMA', 'driving_license', 'car_registration'];
      if (gatePassTypes.includes(doc.document_type)) {
        const activeWos = await documentsRepository.findActiveWorkOrdersForEngineer(tenantId, doc.owner_user_id);
        if (activeWos.length > 0) {
          throw new AppError(
            'CONFLICT',
            'Cannot delete engineer gate-pass credential while the engineer is assigned to active work orders.',
            409,
            { workOrders: activeWos }
          );
        }
      }
    }

    await documentsRepository.archiveDocument(id, tenantId);

    await writeAudit(query, {
      tenantId,
      actorUserId,
      action: 'document.delete',
      entityType: 'document',
      entityId: id,
      before: { status: doc.status },
      after: { status: 'archived' }
    });

    return { message: 'Document archived successfully.' };
  }
};
