import bcrypt from 'bcryptjs';
import { authRepository } from './repository.js';
import { signSessionToken } from '../../shared/auth.js';
import { AppError } from '../../shared/errors.js';
import { writeAudit } from '../../shared/audit.js';
import { query } from '../../db/client.js';

/**
 * Service Layer handling user authentication logic, credential verification, and token signing.
 */
export const authService = {
  /**
   * Authenticates user credentials and generates a secure session token.
   * @param {string} email
   * @param {string} password
   * @returns {Promise<{ token: string, user: object }>}
   */
  async login(email, password) {
    const user = await authRepository.findUserByEmail(email);
    if (!user) {
      throw new AppError('UNAUTHENTICATED', 'Invalid email or password.', 401);
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      throw new AppError('UNAUTHENTICATED', 'Invalid email or password.', 401);
    }

    if (user.status !== 'active') {
      throw new AppError('FORBIDDEN', 'Your user account has been disabled. Contact an administrator.', 403);
    }

    const token = await signSessionToken({
      userId: user.id,
      tenantId: user.tenant_id,
      email: user.email,
      role: user.role
    });

    await writeAudit(query, {
      tenantId: user.tenant_id,
      actorUserId: user.id,
      action: 'auth.login',
      entityType: 'user',
      entityId: user.id,
      after: { email: user.email, role: user.role }
    });

    return {
      token,
      user: {
        id: user.id,
        tenantId: user.tenant_id,
        tenantName: user.tenant_name,
        email: user.email,
        name: user.name,
        role: user.role
      }
    };
  },

  /**
   * Fetches profile data for the active authenticated user.
   * @param {string} userId
   * @param {string} tenantId
   * @returns {Promise<object>}
   */
  async getCurrentUser(userId, tenantId) {
    const user = await authRepository.findUserById(userId, tenantId);
    if (!user) {
      throw new AppError('UNAUTHENTICATED', 'User not found.', 401);
    }

    return {
      id: user.id,
      tenantId: user.tenant_id,
      tenantName: user.tenant_name,
      email: user.email,
      name: user.name,
      role: user.role,
      phone: user.phone
    };
  }
};
