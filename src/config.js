import dotenv from 'dotenv';
import { z } from 'zod';

// Load environment variables from .env file
dotenv.config();

/**
 * Zod schema to strictly validate all backend environment variables.
 * Uses discrete database parameters (host, port, db name, user, password).
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().default(4000),
  API_BASE_URL: z.string().default('http://localhost:4000'),
  WEB_BASE_URL: z.string().default('http://localhost:3000'),

  // Discrete Database Configuration
  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.coerce.number().default(5432),
  DB_NAME: z.string().default('invertio_demo'),
  DB_USER: z.string().default('postgres'),
  DB_PASSWORD: z.string().default(''),
  DATABASE_URL: z.string().optional(),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('8h'),
  COOKIE_NAME: z.string().default('invertio_session'),
  COOKIE_SECURE: z.coerce.boolean().default(false),
  COOKIE_DOMAIN: z.string().default('localhost'),
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_LOCAL_ROOT: z.string().default('./storage'),
  PUBLIC_FILE_BASE_URL: z.string().default('http://localhost:4000/files'),
  QR_TOKEN_SECRET: z.string().min(32, 'QR_TOKEN_SECRET must be at least 32 characters'),
  QR_TOKEN_TTL_DAYS: z.coerce.number().default(365),
  MAIL_DRIVER: z.enum(['console', 'smtp']).default('console'),
  EMAIL_FROM: z.string().default('Invertio Demo <no-reply@demo.local>'),
  PAYMENT_DRIVER: z.enum(['mock', 'hyperpay']).default('mock'),
  ZATCA_ENABLED: z.coerce.boolean().default(false),
  VAT_RATE: z.coerce.number().default(0.15),
  TZ: z.string().default('Asia/Riyadh'),
  LOG_LEVEL: z.string().default('info')
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.format());
  process.exit(1);
}

/**
 * Validated application configuration object.
 */
export const config = parsed.data;
