import { z } from 'zod';

/**
 * Validation schema for assigning engineer to a work order.
 */
export const assignEngineerSchema = z.object({
  engineerId: z.string().uuid('Valid engineer user ID is required')
});

/**
 * Validation schema for updating work order status.
 */
export const updateStatusSchema = z.object({
  status: z.enum(['open', 'assigned', 'in_progress', 'completed', 'closed'])
});
