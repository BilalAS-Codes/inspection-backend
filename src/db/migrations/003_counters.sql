CREATE TABLE tenant_counters (
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  value BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, name)
);

CREATE OR REPLACE FUNCTION next_serial(p_tenant UUID, p_name TEXT)
RETURNS BIGINT AS $$
DECLARE v BIGINT;
BEGIN
  INSERT INTO tenant_counters (tenant_id, name, value)
  VALUES (p_tenant, p_name, 1)
  ON CONFLICT (tenant_id, name)
  DO UPDATE SET value = tenant_counters.value + 1
  RETURNING value INTO v;
  RETURN v;
END;
$$ LANGUAGE plpgsql;
