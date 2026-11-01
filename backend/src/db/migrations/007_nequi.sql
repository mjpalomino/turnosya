-- =====================================================================
-- Migración 007: pagos con Nequi (QR + número de cuenta + comprobante)
--   - La plataforma recibe pagos de suscripción por Nequi; el superadmin los aprueba.
--   - Cada negocio recibe pagos de citas por Nequi; el dueño los aprueba.
--   - Los comprobantes se guardan aparte (payment_proofs) y NO son públicos.
-- =====================================================================

-- Nequi de la plataforma (suscripciones)
ALTER TABLE platform_settings
  ADD COLUMN nequi_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN nequi_number  TEXT,
  ADD COLUMN nequi_holder  TEXT,
  ADD COLUMN nequi_qr_url  TEXT;

-- Nequi de cada negocio (citas)
ALTER TABLE tenant_payment_settings
  ADD COLUMN nequi_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN nequi_number  TEXT,
  ADD COLUMN nequi_holder  TEXT,
  ADD COLUMN nequi_qr_url  TEXT;

-- Imagen del QR de Nequi (pública: se muestra a quien paga)
ALTER TABLE media_assets DROP CONSTRAINT IF EXISTS media_assets_kind_check;
ALTER TABLE media_assets
  ADD CONSTRAINT media_assets_kind_check
  CHECK (kind IN ('logo', 'cover', 'platform_logo', 'staff_photo', 'nequi_qr'));

-- Comprobantes de pago (privados: solo los ve quien aprueba)
CREATE TABLE payment_proofs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  mime        TEXT NOT NULL CHECK (mime IN ('image/png', 'image/jpeg', 'image/webp')),
  size_bytes  INTEGER NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 2097152),
  data        BYTEA NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Suscripciones: Nequi como origen y datos de revisión
ALTER TABLE subscription_payments DROP CONSTRAINT IF EXISTS subscription_payments_provider_check;
ALTER TABLE subscription_payments
  ADD CONSTRAINT subscription_payments_provider_check CHECK (provider IN ('wompi', 'manual', 'nequi')),
  ADD COLUMN proof_id    UUID REFERENCES payment_proofs(id) ON DELETE SET NULL,
  ADD COLUMN payer_note  TEXT,
  ADD COLUMN reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN reviewed_at TIMESTAMPTZ,
  ADD COLUMN review_note TEXT;

-- Citas: Nequi como origen y datos de revisión
ALTER TABLE appointment_payments
  ADD COLUMN provider    TEXT NOT NULL DEFAULT 'wompi' CHECK (provider IN ('wompi', 'nequi')),
  ADD COLUMN proof_id    UUID REFERENCES payment_proofs(id) ON DELETE SET NULL,
  ADD COLUMN payer_note  TEXT,
  ADD COLUMN reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN reviewed_at TIMESTAMPTZ,
  ADD COLUMN review_note TEXT;

CREATE INDEX subscription_payments_review_idx ON subscription_payments (status) WHERE provider = 'nequi';
CREATE INDEX appointment_payments_review_idx ON appointment_payments (tenant_id, status) WHERE provider = 'nequi';
