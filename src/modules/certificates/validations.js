import { z } from 'zod';

/**
 * Validation schema for issuing a new certificate.
 */
export const issueCertificateSchema = z.object({
  workOrderId: z.string().uuid('Valid workOrderId is required'),
  certificateType: z.enum([
    'safety_compliance',
    'operational_efficiency',
    'environmental_conformance',
    'quality_assurance'
  ])
});

/**
 * Validation schema for revoking an issued certificate.
 */
export const revokeCertificateSchema = z.object({
  reason: z.string().min(5, 'Revocation reason must be at least 5 characters')
});
