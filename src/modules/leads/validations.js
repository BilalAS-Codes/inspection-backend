import { z } from 'zod';

/**
 * Validation schema for creating a new lead.
 */
export const createLeadSchema = z.object({
  source: z.enum(['whatsapp', 'email', 'website', 'manual']),
  clientName: z.string().min(2, 'Client name is required'),
  contactEmail: z.string().email('Valid email is required').optional().or(z.literal('')),
  contactPhone: z.string().optional().or(z.literal('')),
  assignedTo: z.string().uuid().optional().nullable(),
  notes: z.string().optional()
});

/**
 * Validation schema for transitioning lead status.
 */
export const updateStatusSchema = z.object({
  status: z.enum(['new', 'contacted', 'proposal_sent', 'converted', 'lost'])
});
