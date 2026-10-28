-- =====================================================================
-- Migración 002: cobro de suscripciones con Wompi
-- Registra cada intento de pago y su resultado.
-- =====================================================================

CREATE TABLE subscription_payments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  plan_id         UUID REFERENCES plans(id),
  reference       TEXT NOT NULL UNIQUE,            -- referencia única enviada a Wompi
  amount_in_cents INTEGER NOT NULL CHECK (amount_in_cents >= 0),
  currency        TEXT NOT NULL DEFAULT 'COP',
  -- Estado local del pago. Refleja el de Wompi.
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'approved', 'declined', 'voided', 'error')),
  provider        TEXT NOT NULL DEFAULT 'wompi',
  wompi_transaction_id TEXT,                        -- id de la transacción en Wompi
  period_months   INTEGER NOT NULL DEFAULT 1,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX subscription_payments_tenant_idx ON subscription_payments (tenant_id, created_at);
CREATE INDEX subscription_payments_status_idx ON subscription_payments (status);
