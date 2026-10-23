import bcrypt from 'bcryptjs';
import { usersRepository } from './repository.js';
import { AppError } from '../../shared/errors.js';
import { writeAudit } from '../../shared/audit.js';

const VALID_ROLES = ['admin', 'sales', 'engineer', 'finance'];

/**
 * Service Layer for User & Engineer lifecycle management.
 */
export const usersService = {
  /**
   * Lists users in a tenant with compliance indicators.
   * @param {string} tenantId - Tenant identifier
   * @param {object} filters - Filters (role, status)
   * @returns {Promise<any[]>}
   */
  async listUsers(tenantId, filters = {}) {
    return await usersRepository.findUsers(tenantId, filters);
  },

  /**
   * Onboards and creates a new user / engineer.
   * @param {string} tenantId - Tenant identifier
   * @param {string} actorUserId - ID of user creating the record
   * @param {object} payload - User attributes
   * @returns {Promise<any>} Created user
   */
  async createUser(tenantId, actorUserId, { email, password, name, role = 'engineer', phone }) {
    if (!email || !name) {
      throw new AppError('VALIDATION_FAILED', 'Name and email are required.', 400);
    }

    if (!VALID_ROLES.includes(role)) {
      throw new AppError('VALIDATION_FAILED', `Invalid role. Allowed roles: ${VALID_ROLES.join(', ')}`, 400);
    }

    const existing = await usersRepository.findUserByEmail(tenantId, email);
    if (existing) {
      throw new AppError('CONFLICT', `User with email '${email}' already exists.`, 409);
    }

    // Default password if not provided
    const rawPassword = password || 'Alliance@2026';
    const passwordHash = await bcrypt.hash(rawPassword, 10);

    const user = await usersRepository.createUser(tenantId, {
      email,
      passwordHash,
      name,
      role,
      phone
    });

    await writeAudit(null, {
      tenantId,
      actorUserId,
      action: 'user.create',
      entityType: 'user',
      entityId: user.id,
      after: { email: user.email, name: user.name, role: user.role }
    });

    return user;
  },

  /**
   * Toggles or updates user status.
   * @param {string} id - User UUID
   * @param {string} tenantId - Tenant identifier
   * @param {string} actorUserId - Actor UUID
   * @param {string} status - 'active' | 'disabled'
   * @returns {Promise<any>}
   */
  async setStatus(id, tenantId, actorUserId, status) {
    if (!['active', 'disabled'].includes(status)) {
      throw new AppError('VALIDATION_FAILED', "Status must be 'active' or 'disabled'.", 400);
    }

    const updated = await usersRepository.updateUserStatus(id, tenantId, status);
    if (!updated) {
      throw new AppError('NOT_FOUND', 'User not found.', 404);
    }

    await writeAudit(null, {
      tenantId,
      actorUserId,
      action: 'user.update_status',
      entityType: 'user',
      entityId: id,
      after: { status }
    });

    return updated;
  }
};
