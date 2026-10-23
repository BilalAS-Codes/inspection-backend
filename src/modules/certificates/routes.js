import express from 'express';
import { authMiddleware } from '../../shared/auth.js';
import { validate } from '../../shared/validate.js';
import { issueCertificateSchema, revokeCertificateSchema } from './validations.js';
import { certificatesController } from './controller.js';

const router = express.Router();

/**
 * @openapi
 * /api/certificates:
 *   get:
 *     tags:
 *       - Certificates
 *     summary: List certificates
 *     description: Returns all certificates for the authenticated tenant with work order details and PDF URLs.
 *     responses:
 *       200:
 *         description: List of certificates.
 *   post:
 *     tags:
 *       - Certificates
 *     summary: Issue certificate
 *     description: Issues an official certificate with embedded QR code. Requires inspection submission outcome to be strictly 'safe'. Deduplicates per equipment serial and type per day.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - workOrderId
 *               - certificateType
 *             properties:
 *               workOrderId:
 *                 type: string
 *                 format: uuid
 *                 description: Unique identifier of completed work order. [Compulsory]
 *               certificateType:
 *                 type: string
 *                 enum: [safety_compliance, operational_efficiency, environmental_conformance, quality_assurance]
 *                 description: Category of inspection certificate. [Compulsory]
 *     responses:
 *       201:
 *         description: Certificate issued.
 *       404:
 *         description: Work order not found.
 *       409:
 *         description: Conflict - certificate already issued today for this equipment and type.
 *       422:
 *         description: Cannot issue certificate - inspection outcome was not safe.
 */
router.get('/', authMiddleware, certificatesController.listCertificates);
router.post('/', authMiddleware, validate(issueCertificateSchema), certificatesController.issueCertificate);

/**
 * @openapi
 * /api/certificates/{id}/revoke:
 *   post:
 *     tags:
 *       - Certificates
 *     summary: Revoke certificate
 *     description: Marks an issued certificate as revoked. Requires mandatory reason string.
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
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - reason
 *             properties:
 *               reason:
 *                 type: string
 *                 minLength: 5
 *                 description: Official justification for revocation. [Compulsory]
 *     responses:
 *       200:
 *         description: Certificate revoked.
 *       404:
 *         description: Certificate not found.
 *       409:
 *         description: Certificate already revoked.
 */
router.post('/:id/revoke', authMiddleware, validate(revokeCertificateSchema), certificatesController.revokeCertificate);

/**
 * @openapi
 * /api/certificates/{id}/pdf:
 *   get:
 *     tags:
 *       - Certificates
 *     summary: Download certificate PDF
 *     description: Streams the official certificate PDF file.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: PDF file binary.
 *       404:
 *         description: Certificate PDF not found.
 */
router.get('/:id/pdf', certificatesController.getPdf);

/**
 * @openapi
 * /api/certificates/{id}/qr.png:
 *   get:
 *     tags:
 *       - Certificates
 *     summary: Get QR code image
 *     description: Returns the PNG QR code linking to public verification.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: QR image binary (image/png).
 *       404:
 *         description: Certificate not found.
 */
router.get('/:id/qr.png', certificatesController.getQr);

/**
 * @openapi
 * /api/verify/{token}:
 *   get:
 *     tags:
 *       - Certificates
 *     summary: Public Certificate Verification
 *     description: Public endpoint (no auth cookie required). Verifies certificate cryptographic signature and real-time validity status. Returns generic 404 for tampered, expired, or non-existent tokens to prevent enumeration.
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *         description: Signed JWT token from QR code.
 *     responses:
 *       200:
 *         description: Certificate status and details.
 *       404:
 *         description: This certificate could not be verified (Anti-enumeration).
 */
router.get('/verify/:token', certificatesController.verifyCertificate);

export default router;
