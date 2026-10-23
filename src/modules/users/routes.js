import { Router } from 'express';
import { usersController } from './controller.js';
import { authMiddleware } from '../../shared/auth.js';

const router = Router();

router.use(authMiddleware);

router.get('/', usersController.listUsers);
router.post('/', usersController.createUser);
router.patch('/:id/status', usersController.setStatus);

export default router;
