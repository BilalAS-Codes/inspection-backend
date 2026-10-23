import { query } from '../../db/client.js';

/**
 * Data Access Layer for Inspection submissions and checklist templates.
 */
export const inspectionsRepository = {
  /**
   * Finds a work order by ID and tenant ID.
   * @param {string} workOrderId
   * @param {string} tenantId
   * @returns {Promise<any|null>}
   */
  async findWorkOrder(workOrderId, tenantId) {
    const res = await query(
      'SELECT id, tenant_id, status, assigned_engineer_id FROM work_orders WHERE id = $1 AND tenant_id = $2;',
      [workOrderId, tenantId]
    );
    return res.rows[0] || null;
  },

  /**
   * Finds an existing submission for a work order.
   * @param {string} workOrderId
   * @returns {Promise<any|null>}
   */
  async findSubmissionByWorkOrderId(workOrderId) {
    const res = await query(
      'SELECT * FROM inspection_submissions WHERE work_order_id = $1;',
      [workOrderId]
    );
    return res.rows[0] || null;
  },

  /**
   * Finds submission by its ID.
   * @param {string} id
   * @param {string} tenantId
   * @returns {Promise<any|null>}
   */
  async findSubmissionById(id, tenantId) {
    const res = await query(
      'SELECT * FROM inspection_submissions WHERE id = $1 AND tenant_id = $2;',
      [id, tenantId]
    );
    return res.rows[0] || null;
  },

  /**
   * Inserts an inspection submission.
   * @param {object} submissionData
   * @returns {Promise<any>}
   */
  async createSubmission({
    tenantId,
    workOrderId,
    engineerId,
    checklistId,
    answers,
    photos,
    equipment,
    result,
    notes
  }) {
    const res = await query(`
      INSERT INTO inspection_submissions (
        tenant_id, work_order_id, engineer_id, checklist_id, answers_jsonb,
        photos_jsonb, equipment_jsonb, result, notes
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9
      ) RETURNING *;
    `, [
      tenantId,
      workOrderId,
      engineerId,
      checklistId || null,
      JSON.stringify(answers),
      JSON.stringify(photos || []),
      JSON.stringify(equipment),
      result,
      notes || null
    ]);
    return res.rows[0];
  }
};
