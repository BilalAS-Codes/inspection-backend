import { z } from 'zod';

/**
 * Validation schema for querying audit logs.
 */
export const listAuditLogsSchema = z.object({
  entityType: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z.coerce.number().min(1).max(500).optional().default(200)
});
