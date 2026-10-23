import { certificatesService } from './services.js';

/**
 * Controller Layer for Certificate endpoints.
 */
export const certificatesController = {
  /**
   * GET /api/certificates
   * Lists all certificates for the current tenant.
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  async listCertificates(req, res, next) {
    try {
      const certificates = await certificatesService.listCertificates(req.tenantId);
      return res.status(200).json({ certificates });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/certificates
   * Issues a new certificate based on a verified safe inspection.
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  async issueCertificate(req, res, next) {
    try {
      const certificate = await certificatesService.issueCertificate(
        req.tenantId,
        req.user.id,
        req.body
      );
      return res.status(201).json({ certificate });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/certificates/:id/revoke
   * Revokes an existing certificate.
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  async revokeCertificate(req, res, next) {
    try {
      const certificate = await certificatesService.revokeCertificate(
        req.tenantId,
        req.user.id,
        req.params.id,
        req.body.reason
      );
      return res.status(200).json({
        message: 'Certificate revoked successfully.',
        certificate
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/certificates/:id/pdf
   * Streams the generated PDF of the certificate.
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  async getPdf(req, res, next) {
    try {
      const { buffer, filename } = await certificatesService.getPdfBuffer(req.params.id);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
      return res.send(buffer);
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/certificates/:id/qr.png
   * Streams the generated QR code PNG image.
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  async getQr(req, res, next) {
    try {
      const qrBuffer = await certificatesService.getQrBuffer(req.params.id);
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.send(qrBuffer);
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/verify/:token
   * Public endpoint to verify certificate authenticity with anti-enumeration protection.
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  async verifyCertificate(req, res, next) {
    try {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

      const ip = req.ip || req.headers['x-forwarded-for'];
      const data = await certificatesService.verifyCertificate(req.params.token, ip);

      if (!data) {
        return res.status(404).json({
          valid: false,
          message: 'This certificate could not be verified.'
        });
      }

      return res.status(200).json(data);
    } catch (err) {
      next(err);
    }
  }
};
