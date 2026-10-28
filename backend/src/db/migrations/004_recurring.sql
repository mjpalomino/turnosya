-- =====================================================================
-- Migración 004: cobro recurrente automático mensual (Wompi)
-- Guarda la fuente de pago tokenizada del negocio y el control de auto-cobro.
-- =====================================================================

ALTER TABLE subscriptions
  ADD COLUMN wompi_payment_source_id TEXT,      -- id de la fuente de pago en Wompi
  ADD COLUMN auto_renew BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN payer_email TEXT,                  -- email del pagador (requerido por Wompi)
  ADD COLUMN last_charge_attempt_at TIMESTAMPTZ,
  ADD COLUMN failed_charges INTEGER NOT NULL DEFAULT 0;

-- Marca los pagos generados por el cobro automático.
ALTER TABLE subscription_payments
  ADD COLUMN is_recurring BOOLEAN NOT NULL DEFAULT false;
