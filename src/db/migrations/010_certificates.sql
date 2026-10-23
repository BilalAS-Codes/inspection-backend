CREATE TABLE certificates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  work_order_id UUID NOT NULL REFERENCES work_orders(id),
  inspection_submission_id UUID NOT NULL REFERENCES inspection_submissions(id),
  certificate_number TEXT NOT NULL,
  certificate_type TEXT NOT NULL CHECK (certificate_type IN
    ('safety_compliance','operational_efficiency','environmental_conformance','quality_assurance')),
  equipment_serial TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'issued'
    CHECK (status IN ('issued','expired','revoked')),
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  equipment_jsonb JSONB NOT NULL,
  inspecting_company_name TEXT NOT NULL,
  qr_payload TEXT NOT NULL,
  pdf_key TEXT,
  revocation_reason TEXT,
  revoked_at TIMESTAMPTZ,
  UNIQUE (tenant_id, certificate_number)
);
CREATE UNIQUE INDEX cert_dedupe_idx ON certificates
  (tenant_id, equipment_serial, certificate_type, ((issued_at AT TIME ZONE 'UTC')::date))
  WHERE status <> 'revoked';
