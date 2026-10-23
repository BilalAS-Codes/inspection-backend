import { z } from 'zod';

/**
 * Validation schema for creating a proposal draft.
 */
export const createProposalSchema = z.object({
  leadId: z.string().uuid().optional().nullable(),
  type: z.enum(['commercial', 'technical']),
  variables: z.record(z.any())
});

/**
 * Validation schema for digital proposal acceptance.
 */
export const acceptProposalSchema = z.object({
  email: z.string().email('Valid email is required')
});
