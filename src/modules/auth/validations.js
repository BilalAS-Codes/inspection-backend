import { z } from 'zod';

/**
 * Validation schema for user login payload.
 */
export const loginSchema = z.object({
  email: z.string().email('Valid email is required'),
  password: z.string().min(1, 'Password is required')
});
