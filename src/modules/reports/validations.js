import { z } from 'zod';

/**
 * Validation schema for optional date range query params on reports.
 */
export const reportDateRangeSchema = z.object({
  startDate: z.string().date().optional(),
  endDate: z.string().date().optional()
});
