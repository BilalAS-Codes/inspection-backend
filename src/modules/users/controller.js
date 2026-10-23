import { usersService } from './services.js';

/**
 * Controller Layer for Users endpoints.
 */
export const usersController = {
  /**
   * GET /api/users
   */
  async listUsers(req, res, next) {
    try {
      const { role, status } = req.query;
      const users = await usersService.listUsers(req.tenantId, { role, status });
      return res.status(200).json({ users });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/users
   */
  async createUser(req, res, next) {
    try {
      const user = await usersService.createUser(req.tenantId, req.user?.id, req.body);
      return res.status(201).json({
        message: `User '${user.name}' onboarded successfully.`,
        user
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * PATCH /api/users/:id/status
   */
  async setStatus(req, res, next) {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const user = await usersService.setStatus(id, req.tenantId, req.user?.id, status);
      return res.status(200).json({ message: `User status updated to ${status}`, user });
    } catch (err) {
      next(err);
    }
  }
};
