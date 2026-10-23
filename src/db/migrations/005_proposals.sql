CREATE TABLE proposal_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  type TEXT NOT NULL CHECK (type IN ('commercial','technical')),
  name TEXT NOT NULL,
  body_html TEXT NOT NULL
);

CREATE TABLE proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  lead_id UUID REFERENCES leads(id),
  type TEXT NOT NULL CHECK (type IN ('commercial','technical')),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','generating','sent','accepted','rejected','expired')),
  content_jsonb JSONB NOT NULL,
  pdf_key TEXT,
  access_token_hash TEXT,
  access_token_expires_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  accepted_by_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX proposals_tenant_status_idx ON proposals (tenant_id, status);
