# inspection-backend

Industrial Inspection & Certification Management Platform — Backend API Service.

Built with Node.js, Express, PostgreSQL, PDF-Lib, and Zod validation.

## Features
- **Multi-Tenant Architecture with Role-Based Access Control (RBAC)**
- **PostgreSQL Schemas with Automatic Idempotent Migrations**
- **ZATCA E-Invoicing Phase 2 Cryptographic Hashes**
- **QR Code Signed Verification (Ed25519 / HMAC)**
- **Complete Audit Trail & Real-time Notification Logs**
- **Interactive Swagger 3.0 Documentation at `/docs`**

## Getting Started
```bash
npm install
npm run migrate
npm run dev
```
Runs at `http://localhost:4000`.
