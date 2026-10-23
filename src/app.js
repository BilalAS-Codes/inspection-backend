import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';
import swaggerUi from 'swagger-ui-express';
import { fileURLToPath } from 'url';

import { config } from './config.js';
import { errorHandler } from './shared/errors.js';
import { authMiddleware } from './shared/auth.js';
import { AppError } from './shared/errors.js';

// Route handlers
import authRoutes from './modules/auth/routes.js';
import leadsRoutes from './modules/leads/routes.js';
import proposalsRoutes from './modules/proposals/routes.js';
import invoicesRoutes from './modules/invoices/routes.js';
import workOrdersRoutes from './modules/work-orders/routes.js';
import documentsRoutes from './modules/documents/routes.js';
import inspectionsRoutes from './modules/inspections/routes.js';
import certificatesRoutes from './modules/certificates/routes.js';
import notificationsRoutes from './modules/notifications/routes.js';
import reportsRoutes from './modules/reports/routes.js';
import auditRoutes from './modules/audit/routes.js';
import usersRoutes from './modules/users/routes.js';
import clientsRoutes from './modules/clients/routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const app = express();

// 1. CORS Middleware - Dynamically accepts any destination origin with credential support
const corsOptions = {
  origin: (origin, callback) => {
    // Allow any origin dynamically (supports credentials: true for LAN IP, localhost, mobile, and server tools)
    callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'Accept', 'X-Requested-With', 'Cache-Control', 'Pragma'],
  exposedHeaders: ['Content-Disposition', 'Content-Type']
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
// 2. Parsers
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// 3. Swagger OpenAPI 3.0 Documentation UI & JSON endpoint
const swaggerPath = path.resolve(__dirname, '../swagger.json');
if (fs.existsSync(swaggerPath)) {
  const swaggerDocument = JSON.parse(fs.readFileSync(swaggerPath, 'utf8'));
  app.get('/api/docs/swagger.json', (req, res) => res.json(swaggerDocument));
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
}

// 4. Files Static Serving Middleware
// Public for certificates/* and proposals/* (token-gated URLs)
// Auth-checked for documents/*
const storageRoot = path.resolve(config.STORAGE_LOCAL_ROOT);
app.use('/files', (req, res, next) => {
  const requestPath = req.path.replace(/^\/+/, '');
  if (requestPath.startsWith('documents/')) {
    return authMiddleware(req, res, () => {
      express.static(storageRoot)(req, res, next);
    });
  }
  return express.static(storageRoot)(req, res, next);
});

// 5. Mount API Routes
app.use('/api/auth', authRoutes);
app.use('/api/leads', leadsRoutes);
app.use('/api/proposals', proposalsRoutes);
app.use('/api/invoices', invoicesRoutes);
app.use('/api/webhooks/mock-pay', (req, res, next) => {
  // Direct webhook mount as specified in prompt: POST /api/webhooks/mock-pay
  req.url = '/webhook';
  return invoicesRoutes(req, res, next);
});
app.use('/api/work-orders', workOrdersRoutes);
app.use('/api/documents', documentsRoutes);
app.use('/api/inspections', inspectionsRoutes);
app.use('/api/certificates', certificatesRoutes);
app.use('/api/verify', (req, res, next) => {
  // Public verification mount: GET /api/verify/:token
  req.url = `/verify${req.url}`;
  return certificatesRoutes(req, res, next);
});
app.use('/api/notifications', notificationsRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/audit-logs', auditRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/clients', clientsRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 6. 404 Handler
app.use((req, res, next) => {
  next(new AppError('NOT_FOUND', `Route not found: ${req.method} ${req.path}`, 404));
});

// 7. Global Error Handler
app.use(errorHandler);
