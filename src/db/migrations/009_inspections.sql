CREATE TABLE inspection_checklists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  equipment_type TEXT NOT NULL,
  items_jsonb JSONB NOT NULL,
  UNIQUE (tenant_id, equipment_type)
);

CREATE TABLE inspection_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  work_order_id UUID NOT NULL REFERENCES work_orders(id),
  engineer_id UUID NOT NULL REFERENCES users(id),
  checklist_id UUID REFERENCES inspection_checklists(id),
  answers_jsonb JSONB NOT NULL,
  photos_jsonb JSONB NOT NULL DEFAULT '[]',
  equipment_jsonb JSONB NOT NULL,
  result TEXT NOT NULL CHECK (result IN ('safe','unsafe','conditional')),
  notes TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (work_order_id)
);
