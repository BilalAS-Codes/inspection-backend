import { pool, query as defaultQuery } from '../db/client.js';

/**
 * Writes an immutable audit entry to the audit_logs table.
 * Every state-changing endpoint must invoke this to maintain an authoritative traceability trail.
 *
 * @param {import('pg').Pool | import('pg').PoolClient | Function} [clientOrPool] - Database client, pool, or query function
 * @param {object} params
 * @param {string} params.tenantId - Tenant UUID
 * @param {string} [params.actorUserId] - ID of user triggering the action (null for public/system events)
 * @param {string} params.action - Action identifier (e.g. 'lead.convert', 'proposal.accept')
 * @param {string} params.entityType - Target entity name (e.g. 'lead', 'proposal', 'invoice')
 * @param {string} [params.entityId] - Target entity UUID
 * @param {object} [params.before] - State before change
 * @param {object} [params.after] - State after change
 * @returns {Promise<void>}
 */
export async function writeAudit(clientOrPool, {
  tenantId,
  actorUserId = null,
  action,
  entityType,
  entityId = null,
  before = null,
  after = null
}) {
  try {
    const executeQuery = typeof clientOrPool === 'function'
      ? clientOrPool
      : clientOrPool?.query
        ? clientOrPool.query.bind(clientOrPool)
        : defaultQuery;

    await executeQuery(`
      INSERT INTO audit_logs (
        tenant_id, actor_user_id, action, entity_type, entity_id, before_jsonb, after_jsonb
      ) VALUES ($1, $2, $3, $4, $5, $6, $7);
    `, [
      tenantId,
      actorUserId,
      action,
      entityType,
      entityId,
      before ? JSON.stringify(before) : null,
      after ? JSON.stringify(after) : null
    ]);
  } catch (err) {
    console.error('[Audit] Failed to write audit log:', err);
    // Do not crash the primary transaction for an audit log failure unless critical
  }
}
