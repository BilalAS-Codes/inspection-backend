CREATE TABLE work_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  wo_number TEXT NOT NULL,
  proposal_id UUID REFERENCES proposals(id),
  invoice_id UUID REFERENCES invoices(id),
  client_name TEXT NOT NULL,
  client_email TEXT,
  client_phone TEXT,
  location_text TEXT,
  google_maps_url TEXT,
  inspection_location TEXT,
  service_type TEXT,
  inspection_category TEXT,
  scope TEXT,
  certificate_validity_days INT NOT NULL DEFAULT 365,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','assigned','in_progress','completed','closed')),
  assigned_engineer_id UUID REFERENCES users(id),
  due_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, wo_number)
);
CREATE INDEX work_orders_tenant_status_idx ON work_orders (tenant_id, status);
