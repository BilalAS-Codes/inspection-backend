import { z } from 'zod';

/**
 * Validation schema for submitting an inspection checklist and equipment details.
 */
export const submitInspectionSchema = z.object({
  workOrderId: z.string().uuid('Valid workOrderId is required'),
  checklistId: z.string().uuid().optional().nullable(),
  answers: z.record(z.object({
    status: z.enum(['yes', 'no', 'na']),
    comment: z.string().optional()
  })),
  equipment: z.object({
    manufacturer: z.string().min(1, 'Manufacturer is required'),
    model: z.string().min(1, 'Model is required'),
    serial: z.string().min(1, 'Serial number is required'),
    year: z.coerce.number().optional(),
    capacity: z.string().optional()
  }),
  result: z.enum(['safe', 'unsafe', 'conditional']),
  photos: z.array(z.string()).optional().default([]),
  notes: z.string().optional()
});
