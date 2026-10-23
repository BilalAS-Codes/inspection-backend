import { z } from 'zod';

/**
 * Validation schema for mock payment webhook.
 */
export const mockPayWebhookSchema = z.object({
  paymentId: z.string().uuid().optional(),
  invoiceId: z.string().uuid().optional(),
  status: z.enum(['succeeded', 'failed']),
  idempotencyKey: z.string().min(1, 'idempotencyKey is required')
});
