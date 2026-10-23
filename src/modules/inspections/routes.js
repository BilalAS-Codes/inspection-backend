import express from 'express';
import { authMiddleware } from '../../shared/auth.js';
import { validate } from '../../shared/validate.js';
import { submitInspectionSchema } from './validations.js';
import { inspectionsController } from './controller.js';
import { workOrdersController } from '../work-orders/controller.js';
import { assignEngineerSchema } from '../work-orders/validations.js';

const router = express.Router();
router.use(authMiddleware);

/**
 * @openapi
 * /api/inspections:
 *   post:
 *     tags:
 *       - Inspections
 *     summary: Submit inspection checklist
 *     description: Submits completed checklist and equipment details. Strictly verifies that if any checklist answer is 'no', the outcome cannot be 'safe'.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - workOrderId
 *               - answers
 *               - equipment
 *               - result
 *             properties:
 *               workOrderId:
 *                 type: string
 *                 format: uuid
 *                 description: Unique identifier of the work order. [Compulsory]
 *               checklistId:
 *                 type: string
 *                 format: uuid
 *                 description: Optional checklist template ID. [Optional]
 *               answers:
 *                 type: object
 *                 description: Map of item codes to { status: 'yes'|'no'|'na', comment?: string }. [Compulsory]
 *                 additionalProperties:
 *                   type: object
 *                   required:
 *                     - status
 *                   properties:
 *                     status:
 *                       type: string
 *                       enum: [yes, no, na]
 *                     comment:
 *                       type: string
 *               equipment:
 *                 type: object
 *                 required:
 *                   - manufacturer
 *                   - model
 *                   - serial
 *                 properties:
 *                   manufacturer:
 *                     type: string
 *                     description: Equipment manufacturer. [Compulsory]
 *                   model:
 *                     type: string
 *                     description: Model name or number. [Compulsory]
 *                   serial:
 *                     type: string
 *                     description: Equipment serial number. [Compulsory]
 *                   year:
 *                     type: integer
 *                     description: Manufacturing year. [Optional]
 *                   capacity:
 *                     type: string
 *                     description: Rated capacity (e.g. 50 Ton). [Optional]
 *               result:
 *                 type: string
 *                 enum: [safe, unsafe, conditional]
 *                 description: Inspection conclusion. [Compulsory]
 *               photos:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Array of photo URLs or base64. [Optional]
 *               notes:
 *                 type: string
 *                 description: Field engineer observations and comments. [Optional]
 *     responses:
 *       201:
 *         description: Inspection submitted successfully.
 *       404:
 *         description: Work order not found.
 *       409:
 *         description: Inspection already submitted for this work order.
 *       422:
 *         description: Contradictory outcome (marked safe despite 'no' answers).
 */
router.post('/', validate(submitInspectionSchema), inspectionsController.submitInspection);

/**
 * @openapi
 * /api/inspections/work-order/{workOrderId}:
 *   get:
 *     tags:
 *       - Inspections
 *     summary: Get inspection by work order ID
 *     description: Retrieves the inspection submission for the specified work order.
 *     parameters:
 *       - in: path
 *         name: workOrderId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Inspection submission details.
 *       404:
 *         description: Submission not found.
 */
router.get('/work-order/:workOrderId', inspectionsController.getByWorkOrderId);

/**
 * Route aliases for engineer dispatch to ensure compatibility.
 */
router.patch('/work-order/:id/assign', validate(assignEngineerSchema), workOrdersController.assignEngineer);
router.patch('/:id/assign', validate(assignEngineerSchema), workOrdersController.assignEngineer);

export default router;
