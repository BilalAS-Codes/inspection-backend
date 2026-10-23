import { inspectionsRepository } from './repository.js';
import { query } from '../../db/client.js';
import { AppError } from '../../shared/errors.js';
import { writeAudit } from '../../shared/audit.js';

/**
 * Service Layer for Inspection checklist submissions and safety validation rules.
 */
export const inspectionsService = {
  /**
   * Submits an inspection checklist with strict server-side outcome verification:
   * If ANY checklist answer is 'no', the outcome cannot be 'safe'.
   * Rejects contradictory submissions with 422 UNPROCESSABLE.
   * @param {string} tenantId
   * @param {string} actorUserId
   * @param {object} data
   * @returns {Promise<any>}
   */
  async submitInspection(tenantId, actorUserId, data) {
    const { workOrderId, checklistId, answers, equipment, photos, notes, result } = data;

    // 1. Check Work Order existence
    const wo = await inspectionsRepository.findWorkOrder(workOrderId, tenantId);
    if (!wo) {
      throw new AppError('NOT_FOUND', 'Work Order not found.', 404);
    }

    // 2. Server-side rule: Inspect answers
    let hasNoAnswer = false;
    for (const [key, answer] of Object.entries(answers || {})) {
      if (answer && answer.status === 'no') {
        hasNoAnswer = true;
        break;
      }
    }

    if (hasNoAnswer && result === 'safe') {
      throw new AppError(
        'UNPROCESSABLE',
        "Inspection outcome cannot be marked as 'safe' when one or more checklist items failed with 'no'.",
        422,
        { reason: 'checklist_failed_items_present', forcedResult: 'unsafe' }
      );
    }

    const finalResult = hasNoAnswer ? 'unsafe' : result;

    // 3. Insert inspection submission
    try {
      const submission = await inspectionsRepository.createSubmission({
        tenantId,
        workOrderId,
        engineerId: actorUserId,
        checklistId,
        answers,
        photos,
        equipment,
        result: finalResult,
        notes
      });

      await writeAudit(query, {
        tenantId,
        actorUserId,
        action: 'inspection.submit',
        entityType: 'inspection_submission',
        entityId: submission.id,
        after: { workOrderId, result: finalResult, serial: equipment?.serial }
      });

      return submission;
    } catch (dbErr) {
      if (dbErr.code === '23505') {
        throw new AppError(
          'CONFLICT',
          'An inspection has already been submitted for this work order.',
          409,
          { workOrderId }
        );
      }
      throw dbErr;
    }
  },

  /**
   * Retrieves inspection submission by work order id.
   * @param {string} workOrderId
   * @returns {Promise<any>}
   */
  async getInspectionByWorkOrderId(workOrderId) {
    const submission = await inspectionsRepository.findSubmissionByWorkOrderId(workOrderId);
    if (!submission) {
      throw new AppError('NOT_FOUND', 'Inspection submission not found for this work order.', 404);
    }
    return submission;
  }
};
