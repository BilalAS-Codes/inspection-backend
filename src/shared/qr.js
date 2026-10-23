import * as jose from 'jose';
import QRCode from 'qrcode';
import { config } from '../config.js';

const qrSecretKey = new TextEncoder().encode(config.QR_TOKEN_SECRET);

/**
 * Signs a tamper-evident JWT verification token embedded in public QR codes.
 *
 * @param {object} claims
 * @param {string} claims.certId - Certificate UUID
 * @param {string} claims.serial - Equipment serial number
 * @param {string} [claims.ttlDays] - Expiry TTL in days (defaults to config)
 * @returns {Promise<string>} Compact signed JWT
 */
export async function signVerifyToken(claims) {
  const ttlDays = claims.ttlDays || config.QR_TOKEN_TTL_DAYS;
  return await new jose.SignJWT({
    certId: claims.certId,
    serial: claims.serial
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${ttlDays}d`)
    .sign(qrSecretKey);
}

/**
 * Validates a QR verification token signature and claims.
 * Returns null if token is tampered, invalid, or expired.
 *
 * @param {string} token - Signed QR token
 * @returns {Promise<{ certId: string, serial: string } | null>}
 */
export async function verifyToken(token) {
  try {
    const { payload } = await jose.jwtVerify(token, qrSecretKey);
    return {
      certId: payload.certId,
      serial: payload.serial
    };
  } catch (err) {
    return null;
  }
}

/**
 * Generates a PNG Buffer containing a 2D QR Code.
 *
 * @param {string} url - Target URL to encode in QR code
 * @returns {Promise<Buffer>}
 */
export async function generateQrBuffer(url) {
  return await QRCode.toBuffer(url, {
    errorCorrectionLevel: 'M',
    type: 'png',
    margin: 2,
    width: 256,
    color: {
      dark: '#171717',
      light: '#ffffff'
    }
  });
}
