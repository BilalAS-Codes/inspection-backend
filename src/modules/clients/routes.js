import { Router } from 'express';
import { clientsController } from './controller.js';
import { authMiddleware } from '../../shared/auth.js';

const router = Router();

router.use(authMiddleware);

router.get('/', clientsController.listClients);
router.get('/:id', clientsController.getClientDossier);
router.post('/', clientsController.createClient);

export default router;
