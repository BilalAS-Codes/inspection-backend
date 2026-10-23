import * as jose from 'jose';
import { config } from '../config.js';
import { AppError } from './errors.js';
import { query } from '../db/client.js';

// Convert secret string into Uint8Array for jose
const secretKey = new TextEncoder().encode(config.JWT_SECRET);

/**
 * Signs a JWT session token for an authenticated user.
 *
 * @param {object} payload
 * @param {string} payload.userId
 * @param {string} payload.tenantId
 * @param {string} payload.email
 * @param {string} payload.role
 * @returns {Promise<string>} Signed compact JWT string
 */
export async function signSessionToken(payload) {
  return await new jose.SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(config.JWT_EXPIRES_IN)
    .sign(secretKey);
}

/**
 * Verifies and decodes a session JWT.
 *
 * @param {string} token
 * @returns {Promise<jose.JWTPayload & { userId: string, tenantId: string, email: string, role: string }>}
 */
export async function verifySessionToken(token) {
  try {
    const { payload } = await jose.jwtVerify(token, secretKey);
    return payload;
  } catch (err) {
    throw new AppError('UNAUTHENTICATED', 'Invalid or expired session token.', 401);
  }
}

/**
 * Middleware that extracts session JWT from HTTP-only cookie,
 * verifies it, and attaches the active user and tenantId to `req`.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export async function authMiddleware(req, res, next) {
  try {
    const token = req.cookies?.[config.COOKIE_NAME] || req.headers.authorization?.replace(/^Bearer\s+/, '');

    if (!token) {
      return next(new AppError('UNAUTHENTICATED', 'Authentication required. No session cookie found.', 401));
    }

    const payload = await verifySessionToken(token);

    // Verify user exists and is active in database
    const userRes = await query(
      'SELECT id, tenant_id, email, name, role, status FROM users WHERE id = $1 AND tenant_id = $2;',
      [payload.userId, payload.tenantId]
    );

    if (userRes.rows.length === 0) {
      return next(new AppError('UNAUTHENTICATED', 'User account not found.', 401));
    }

    const user = userRes.rows[0];
    if (user.status !== 'active') {
      return next(new AppError('FORBIDDEN', 'User account is disabled.', 403));
    }

    req.user = {
      id: user.id,
      tenantId: user.tenant_id,
      email: user.email,
      name: user.name,
      role: user.role
    };
    req.tenantId = user.tenant_id;

    next();
  } catch (err) {
    next(err);
  }
}
