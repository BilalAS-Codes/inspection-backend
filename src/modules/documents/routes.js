import express from 'express';
import multer from 'multer';
import { authMiddleware } from '../../shared/auth.js';
import { documentsController } from './controller.js';

const router = express.Router();
router.use(authMiddleware);

// Use in-memory upload so we can sniff magic bytes before saving to disk
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 } // 25MB max
});

/**
 * @openapi
 * /api/documents:
 *   get:
 *     tags:
 *       - Documents
 *     summary: List documents
 *     description: Retrieve all documents with optional filters for category and upcoming expiry.
 *     parameters:
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *           enum: [company, engineer]
 *         description: Optional category filter.
 *       - in: query
 *         name: expiringInDays
 *         schema:
 *           type: integer
 *         description: Optional filter for documents expiring within N days.
 *     responses:
 *       200:
 *         description: List of documents.
 *   post:
 *     tags:
 *       - Documents
 *     summary: Upload new document
 *     description: Uploads a new document file with metadata and magic-byte inspection.
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - file
 *               - category
 *               - documentType
 *               - displayName
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: Binary document file (PDF/PNG/JPEG). [Compulsory]
 *               category:
 *                 type: string
 *                 enum: [company, engineer]
 *                 description: Document category. [Compulsory]
 *               documentType:
 *                 type: string
 *                 description: Document type code (e.g. cr_certificate, IQAMA). [Compulsory]
 *               displayName:
 *                 type: string
 *                 description: Human-readable display label. [Compulsory]
 *               expiryDate:
 *                 type: string
 *                 format: date
 *                 description: Expiry date (YYYY-MM-DD). [Optional]
 *               ownerUserId:
 *                 type: string
 *                 format: uuid
 *                 description: Required if category is engineer. [Optional]
 *               allowPastExpiry:
 *                 type: boolean
 *                 description: Explicit flag to allow uploading historical expired document. [Optional]
 *     responses:
 *       201:
 *         description: Document uploaded.
 *       422:
 *         description: Validation failed or past expiry disallowed.
 */
router.get('/', documentsController.listDocuments);
router.post('/', upload.single('file'), documentsController.uploadDocument);

/**
 * @openapi
 * /api/documents/{id}/versions:
 *   post:
 *     tags:
 *       - Documents
 *     summary: Upload new version of document
 *     description: Uploads an incremental version for an existing document.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - file
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: Version created.
 */
router.post('/:id/versions', upload.single('file'), documentsController.uploadNewVersion);

/**
 * @openapi
 * /api/documents/{id}:
 *   delete:
 *     tags:
 *       - Documents
 *     summary: Archive document
 *     description: Soft deletes document. Enforces gate-pass protection if engineer is assigned to active work orders.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Document archived.
 *       409:
 *         description: Conflict - credential in use on active work order.
 */
router.delete('/:id', documentsController.deleteDocument);

export default router;
