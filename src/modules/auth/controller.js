import { authService } from './services.js';
import { config } from '../../config.js';

/**
 * Controller Layer handling HTTP requests and responses for authentication.
 */
export const authController = {
  /**
   * Handles user login and sets secure HTTP-only cookie.
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  async login(req, res, next) {
    try {
      const { email, password } = req.body;
      const { token, user } = await authService.login(email, password);

      res.cookie(config.COOKIE_NAME, token, {
        httpOnly: true,
        secure: config.COOKIE_SECURE,
        sameSite: 'lax',
        path: '/',
        maxAge: 8 * 60 * 60 * 1000 // 8 hours
      });

      return res.status(200).json({ user, token });
    } catch (err) {
      next(err);
    }
  },

  /**
   * Handles user logout and clears session cookie.
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  logout(req, res) {
    res.clearCookie(config.COOKIE_NAME, {
      httpOnly: true,
      secure: config.COOKIE_SECURE,
      sameSite: 'lax',
      path: '/'
    });

    return res.status(200).json({ message: 'Logged out successfully.' });
  },

  /**
   * Returns current authenticated user profile.
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  async me(req, res, next) {
    try {
      const user = await authService.getCurrentUser(req.user.id, req.tenantId);
      return res.status(200).json({ user });
    } catch (err) {
      next(err);
    }
  }
};
