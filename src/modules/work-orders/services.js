import { workOrdersRepository } from './repository.js';
import { withTransaction, query } from '../../db/client.js';
import { AppError } from '../../shared/errors.js';
import { writeAudit } from '../../shared/audit.js';
import { getNextUniqueSerial } from '../../shared/serial.js';

const LEGAL_WO_TRANSITIONS = {
  open: ['assigned'],
  assigned: ['in_progress', 'open'],
  in_progress: ['completed', 'assigned'],
  completed: ['closed'],
  closed: []
};

/**
 * Service Layer for Work Orders, Gate-Pass credential enforcement, and re-inspection workflows.
 */
export const workOrdersService = {
  /**
   * Lists work orders with status filter.
   * @param {string} tenantId
   * @param {string} [status]
   * @returns {Promise<any[]>}
   */
  async listWorkOrders(tenantId, status) {
    return await workOrdersRepository.findWorkOrders(tenantId, status);
  },

  /**
   * Fetches work order detail, inspection submission, and certificate.
   * @param {string} id
   * @param {string} tenantId
   * @returns {Promise<object>}
   */
  async getWorkOrderDetails(id, tenantId) {
    const workOrder = await workOrdersRepository.findWorkOrderById(id, tenantId);
    if (!workOrder) {
      throw new AppError('NOT_FOUND', 'Work Order not found.', 404);
    }

    const subRes = await query(`
      SELECT s.*, u.name as engineer_name
      FROM inspection_submissions s
      JOIN users u ON s.engineer_id = u.id
      WHERE s.work_order_id = $1;
    `, [id]);
    const submission = subRes.rows[0] || null;

    const certRes = await query('SELECT * FROM certificates WHERE work_order_id = $1;', [id]);
    const certificate = certRes.rows[0] || null;

    // Available certified engineers with real-time gate-pass clearance indicator
    const engRes = await query(`
      SELECT u.id, u.name, u.email,
        EXISTS(
          SELECT 1 FROM documents d
          WHERE d.owner_user_id = u.id AND d.status <> 'archived' AND d.expiry_date < now()
        ) as has_expired_docs
      FROM users u
      WHERE u.tenant_id = $1 AND u.role = 'engineer' AND u.status = 'active'
      ORDER BY u.name ASC;
    `, [tenantId]);
    const availableEngineers = engRes.rows;

    return { workOrder, submission, certificate, availableEngineers };
  },

  /**
   * Gate-pass validation: Assigns engineer only if IQAMA, driving license, and registration are valid.
   * Rejects with 422 if any credential is expired.
   * @param {string} id
   * @param {string} tenantId
   * @param {string} actorUserId
   * @param {string} engineerId
   * @returns {Promise<any>}
   */
  async assignEngineerWithGatePass(id, tenantId, actorUserId, engineerId) {
    const workOrder = await workOrdersRepository.findWorkOrderById(id, tenantId);
    if (!workOrder) {
      throw new AppError('NOT_FOUND', 'Work Order not found.', 404);
    }

    // Verify engineer exists
    const engRes = await query(
      "SELECT id, name, role, status FROM users WHERE id = $1 AND tenant_id = $2 AND role = 'engineer';",
      [engineerId, tenantId]
    );
    if (engRes.rows.length === 0) {
      throw new AppError('NOT_FOUND', 'Engineer user not found.', 404);
    }

    // Gate-pass verification
    const expiredDocs = await workOrdersRepository.findExpiredEngineerDocuments(engineerId);
    if (expiredDocs.length > 0) {
      const blockedBy = expiredDocs.map(r => ({
        documentType: r.document_type,
        displayName: r.display_name,
        expiryDate: r.expiry_date
      }));

      throw new AppError(
        'UNPROCESSABLE',
        'Engineer gate-pass validation failed. Engineer has expired credentials.',
        422,
        { blockedBy }
      );
    }

    const updated = await workOrdersRepository.assignEngineer(id, tenantId, engineerId);

    await writeAudit(query, {
      tenantId,
      actorUserId,
      action: 'work_order.assign',
      entityType: 'work_order',
      entityId: id,
      before: { assigned_engineer_id: workOrder.assigned_engineer_id, status: workOrder.status },
      after: { assigned_engineer_id: engineerId, status: 'assigned' }
    });

    return updated;
  },

  /**
   * Updates work order status along legal state progression.
   * @param {string} id
   * @param {string} tenantId
   * @param {string} actorUserId
   * @param {string} targetStatus
   * @returns {Promise<any>}
   */
  async updateStatus(id, tenantId, actorUserId, targetStatus) {
    const workOrder = await workOrdersRepository.findWorkOrderById(id, tenantId);
    if (!workOrder) {
      throw new AppError('NOT_FOUND', 'Work Order not found.', 404);
    }

    if (workOrder.status === targetStatus) {
      return workOrder;
    }

    const allowed = LEGAL_WO_TRANSITIONS[workOrder.status] || [];
    if (!allowed.includes(targetStatus)) {
      throw new AppError(
        'UNPROCESSABLE',
        `Cannot transition work order from '${workOrder.status}' to '${targetStatus}'.`,
        422,
        { currentStatus: workOrder.status, targetStatus, allowedTransitions: allowed }
      );
    }

    if (targetStatus === 'completed') {
      const subRes = await query('SELECT id FROM inspection_submissions WHERE work_order_id = $1;', [id]);
      if (subRes.rows.length === 0) {
        throw new AppError('UNPROCESSABLE', 'Cannot complete work order without a submitted inspection.', 422);
      }
    }

    const updated = await workOrdersRepository.updateStatus(id, tenantId, targetStatus);

    await writeAudit(query, {
      tenantId,
      actorUserId,
      action: 'work_order.status_change',
      entityType: 'work_order',
      entityId: id,
      before: { status: workOrder.status },
      after: { status: targetStatus }
    });

    return updated;
  },

  /**
   * Admin emergency reopen: resets work order to 'assigned' and removes inspection submission.
   * @param {string} id
   * @param {string} tenantId
   * @param {string} actorUserId
   * @returns {Promise<any>}
   */
  async reopenWorkOrder(id, tenantId, actorUserId) {
    return await withTransaction(async (client) => {
      const woRes = await client.query(
        'SELECT * FROM work_orders WHERE id = $1 AND tenant_id = $2 FOR UPDATE;',
        [id, tenantId]
      );
      if (woRes.rows.length === 0) {
        throw new AppError('NOT_FOUND', 'Work Order not found.', 404);
      }

      const wo = woRes.rows[0];
      await client.query('DELETE FROM inspection_submissions WHERE work_order_id = $1;', [id]);

      const updRes = await client.query(
        "UPDATE work_orders SET status = 'assigned' WHERE id = $1 RETURNING *;",
        [id]
      );

      await writeAudit(client, {
        tenantId,
        actorUserId,
        action: 'work_order.reopen',
        entityType: 'work_order',
        entityId: id,
        before: { status: wo.status },
        after: { status: 'assigned' }
      });

      return updRes.rows[0];
    });
  },

  /**
   * Fetches checklist template for work order category.
   * @param {string} id
   * @param {string} tenantId
   * @returns {Promise<any>}
   */
  async getChecklistForWorkOrder(id, tenantId) {
    const wo = await workOrdersRepository.findWorkOrderById(id, tenantId);
    if (!wo) {
      throw new AppError('NOT_FOUND', 'Work Order not found.', 404);
    }

    const category = wo.inspection_category || 'lifting';
    let checklist = await workOrdersRepository.findChecklist(tenantId, category);
    if (!checklist) {
      checklist = await workOrdersRepository.findChecklist(tenantId, 'lifting');
    }

    return checklist;
  },

  /**
   * Directly creates an industrial work order for a client.
   * @param {string} tenantId
   * @param {string} actorUserId
   * @param {object} payload
   * @returns {Promise<any>}
   */
  async createDirectWorkOrder(tenantId, actorUserId, payload) {
    const {
      clientName,
      clientEmail,
      clientPhone,
      locationText,
      serviceType,
      inspectionCategory,
      scope,
      certificateValidityDays,
      assignedEngineerId,
      dueDate
    } = payload;

    if (!clientName || !clientName.trim()) {
      throw new AppError('VALIDATION_FAILED', 'Client name is required.', 400);
    }

    if (assignedEngineerId) {
      const expiredDocs = await workOrdersRepository.findExpiredEngineerDocuments(assignedEngineerId);
      if (expiredDocs.length > 0) {
        throw new AppError(
          'UNPROCESSABLE',
          'Gate-Pass clearance failed: engineer has expired mandatory documents.',
          422,
          { expiredDocuments: expiredDocs }
        );
      }
    }

    return await withTransaction(async (client) => {
      const woNumber = await getNextUniqueSerial(
        client,
        tenantId,
        'work_order',
        'work_orders',
        'wo_number',
        'WO-'
      );

      const workOrder = await workOrdersRepository.createWorkOrder(client, {
        tenantId,
        woNumber,
        clientName: clientName.trim(),
        clientEmail: clientEmail?.trim() || null,
        clientPhone: clientPhone?.trim() || null,
        locationText: locationText?.trim() || null,
        serviceType: serviceType || 'Regulatory Conformance',
        inspectionCategory: inspectionCategory || 'lifting',
        scope: scope?.trim() || 'Statutory Inspection and Compliance Certification',
        certificateValidityDays: certificateValidityDays ? parseInt(certificateValidityDays, 10) : 365,
        assignedEngineerId: assignedEngineerId || null,
        dueDate: dueDate || null
      });

      await writeAudit(client, {
        tenantId,
        actorUserId,
        action: 'work_order.create_direct',
        entityType: 'work_order',
        entityId: workOrder.id,
        after: {
          woNumber: workOrder.wo_number,
          clientName: workOrder.client_name,
          category: workOrder.inspection_category,
          status: workOrder.status
        }
      });

      return workOrder;
    });
  }
};
