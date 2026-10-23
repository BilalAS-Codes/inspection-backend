import { z } from 'zod';

/**
 * Validation schema for listing notification logs query params.
 */
export const listLogsSchema = z.object({
  limit: z.coerce.number().min(1).max(100).optional().default(50)
});

/**
 * Validation schema for running manual expiry scans.
 */
export const runScanSchema = z.object({
  dryRun: z.boolean().optional().default(false)
});
