CREATE TABLE notification_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  recipient_user_id UUID,
  recipient_address TEXT,
  channel TEXT NOT NULL CHECK (channel IN ('email','sms','push','whatsapp','console')),
  template_key TEXT NOT NULL,
  context_jsonb JSONB,
  status TEXT NOT NULL CHECK (status IN ('queued','sent','failed','skipped')),
  idempotency_key TEXT,
  error_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, idempotency_key)
);
