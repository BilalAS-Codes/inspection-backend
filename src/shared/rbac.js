import { AppError } from './errors.js';

/**
 * Role-Based Access Control (RBAC) middleware factory.
 * Verifies that the authenticated user's role is in the list of allowed roles.
 *
 * @param {string[]} allowedRoles - List of permitted roles (e.g. ['admin', 'sales'])
 * @returns {import('express').RequestHandler}
 */
export function requireRole(allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError('UNAUTHENTICATED', 'Authentication required.', 401));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(
        new AppError(
          'FORBIDDEN',
          `Access denied. Role '${req.user.role}' is not authorized for this resource.`,
          403,
          { requiredRoles: allowedRoles, currentRole: req.user.role }
        )
      );
    }

    next();
  };
}
