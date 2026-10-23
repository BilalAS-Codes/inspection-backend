CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  invoice_number TEXT NOT NULL,
  proposal_id UUID REFERENCES proposals(id),
  client_jsonb JSONB NOT NULL,
  line_items_jsonb JSONB NOT NULL,
  subtotal NUMERIC(15,2) NOT NULL,
  vat_amount NUMERIC(15,2) NOT NULL,
  total NUMERIC(15,2) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'SAR',
  status TEXT NOT NULL DEFAULT 'issued'
    CHECK (status IN ('draft','issued','paid','overdue','cancelled')),
  zatca_uuid TEXT,
  zatca_hash TEXT,
  zatca_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (zatca_status IN ('pending','cleared','failed','stubbed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, invoice_number)
);

CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  invoice_id UUID NOT NULL REFERENCES invoices(id),
  gateway TEXT NOT NULL CHECK (gateway IN ('mock','hyperpay','paytabs','bank_transfer')),
  gateway_txn_id TEXT,
  amount NUMERIC(15,2) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'SAR',
  status TEXT NOT NULL CHECK (status IN ('initiated','succeeded','failed','refunded')),
  idempotency_key TEXT NOT NULL,
  raw_jsonb JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, idempotency_key)
);
