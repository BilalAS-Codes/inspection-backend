import { z } from 'zod';

/**
 * Validation schema for document upload metadata.
 */
export const uploadDocumentSchema = z.object({
  category: z.enum(['company', 'engineer']),
  documentType: z.string().min(1, 'Document type is required'),
  displayName: z.string().min(1, 'Display name is required'),
  expiryDate: z.string().optional().or(z.literal('')),
  ownerUserId: z.string().uuid().optional().nullable().or(z.literal('')),
  allowPastExpiry: z.any().optional()
});
