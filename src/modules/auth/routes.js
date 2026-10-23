import express from 'express';
import { authController } from './controller.js';
import { loginSchema } from './validations.js';
import { validate } from '../../shared/validate.js';
import { authMiddleware } from '../../shared/auth.js';

const router = express.Router();

/**
 * Route declarations for Authentication module.
 */
router.post('/login', validate(loginSchema), authController.login);
router.post('/logout', authController.logout);
router.get('/me', authMiddleware, authController.me);

export default router;
