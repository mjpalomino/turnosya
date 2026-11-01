-- =====================================================================
-- Migración 006: módulo comercial
--   - Ciclos de suscripción (mensual, trimestral, semestral) con descuento por plan.
--   - Funcionalidades por plan (catálogo en lib/plan-features.ts).
--   - Códigos de referido entre negocios suscritos.
--   - Seguimiento de pagos para el superadmin (descuentos, ciclo, pagos manuales).
--   - Datos de contacto de la plataforma y redes extra del negocio.
--   - Foto de empleados.
--   - Configuración de Wompi desde el superadmin (plataforma) y por negocio
--     (cobro en línea de citas). Los secretos se guardan cifrados (AES-256-GCM).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Planes: descuentos por ciclo y descripción comercial.
-- ---------------------------------------------------------------------
ALTER TABLE plans
  ADD COLUMN description            TEXT,
  ADD COLUMN discount_quarterly_pct NUMERIC(5,2) NOT NULL DEFAULT 0
    CHECK (discount_quarterly_pct >= 0 AND discount_quarterly_pct <= 90),
  ADD COLUMN discount_semiannual_pct NUMERIC(5,2) NOT NULL DEFAULT 0
    CHECK (discount_semiannual_pct >= 0 AND discount_semiannual_pct <= 90);

-- ---------------------------------------------------------------------
-- Ajustes de la plataforma (una sola fila): contacto, referidos y Wompi.
-- ---------------------------------------------------------------------
CREATE TABLE platform_settings (
  id                     SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  -- Contacto del sitio principal
  contact_email          TEXT,
  contact_phone          TEXT,
  contact_whatsapp       TEXT,
  contact_address        TEXT,
  contact_city           TEXT,
  support_hours          TEXT,
  instagram              TEXT,
  facebook               TEXT,
  tiktok                 TEXT,
  website                TEXT,
  -- Programa de referidos
  referral_enabled       BOOLEAN NOT NULL DEFAULT true,
  referral_discount_pct  NUMERIC(5,2) NOT NULL DEFAULT 10
    CHECK (referral_discount_pct >= 0 AND referral_discount_pct <= 90),  -- para el negocio nuevo
  referrer_reward_pct    NUMERIC(5,2) NOT NULL DEFAULT 10
    CHECK (referrer_reward_pct >= 0 AND referrer_reward_pct <= 90),     -- para quien refiere
  -- Wompi de la plataforma (cobro de suscripciones). Si están vacíos se usan las variables de entorno.
  wompi_environment      TEXT CHECK (wompi_environment IN ('test', 'prod')),
  wompi_public_key       TEXT,
  wompi_private_key_enc  TEXT,
  wompi_integrity_enc    TEXT,
  wompi_events_enc       TEXT,
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO platform_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------
-- Suscripción: ciclo elegido y código de referido propio.
-- ---------------------------------------------------------------------
ALTER TABLE subscriptions
  ADD COLUMN billing_cycle_months SMALLINT NOT NULL DEFAULT 1
    CHECK (billing_cycle_months IN (1, 3, 6)),
  ADD COLUMN referral_code TEXT UNIQUE;

-- Código para los negocios existentes (8 caracteres, sin ambigüedad).
UPDATE subscriptions
   SET referral_code = upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))
 WHERE referral_code IS NULL;

-- ---------------------------------------------------------------------
-- Referidos: un negocio nuevo usa el código de un negocio suscrito activo.
--   pending  : registrado, aún no paga
--   converted: el referido pagó con descuento; la recompensa queda disponible
--   rewarded : la recompensa ya se aplicó en un pago de quien refirió
--   void     : anulado por el superadmin
-- ---------------------------------------------------------------------
CREATE TABLE referrals (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  referred_tenant_id   UUID NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
  code                 TEXT NOT NULL,
  status               TEXT NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending', 'converted', 'rewarded', 'void')),
  referred_discount_pct NUMERIC(5,2) NOT NULL,
  referrer_reward_pct  NUMERIC(5,2) NOT NULL,
  converted_payment_id UUID,
  reward_payment_id    UUID,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (referrer_tenant_id <> referred_tenant_id)
);
CREATE INDEX referrals_referrer_idx ON referrals (referrer_tenant_id, status);

-- ---------------------------------------------------------------------
-- Pagos: detalle del cálculo y origen (Wompi o manual).
-- ---------------------------------------------------------------------
ALTER TABLE subscription_payments
  ADD COLUMN base_amount_in_cents INTEGER,
  ADD COLUMN discount_in_cents    INTEGER NOT NULL DEFAULT 0 CHECK (discount_in_cents >= 0),
  ADD COLUMN discount_detail      JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN referral_id          UUID REFERENCES referrals(id) ON DELETE SET NULL,
  ADD COLUMN reward_referral_id   UUID REFERENCES referrals(id) ON DELETE SET NULL,
  ADD COLUMN notes                TEXT,
  ADD COLUMN registered_by        UUID REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE subscription_payments DROP CONSTRAINT IF EXISTS subscription_payments_provider_check;
ALTER TABLE subscription_payments
  ADD CONSTRAINT subscription_payments_provider_check CHECK (provider IN ('wompi', 'manual'));

UPDATE subscription_payments SET base_amount_in_cents = amount_in_cents WHERE base_amount_in_cents IS NULL;

-- ---------------------------------------------------------------------
-- Contacto del micrositio: redes y horario en texto.
-- ---------------------------------------------------------------------
ALTER TABLE tenant_branding
  ADD COLUMN facebook       TEXT,
  ADD COLUMN tiktok         TEXT,
  ADD COLUMN opening_hours  TEXT;

-- ---------------------------------------------------------------------
-- Foto de empleados.
-- ---------------------------------------------------------------------
ALTER TABLE staff_profiles ADD COLUMN photo_url TEXT;

ALTER TABLE media_assets DROP CONSTRAINT IF EXISTS media_assets_kind_check;
ALTER TABLE media_assets
  ADD CONSTRAINT media_assets_kind_check CHECK (kind IN ('logo', 'cover', 'platform_logo', 'staff_photo'));

-- ---------------------------------------------------------------------
-- Wompi por negocio: cobro en línea de citas en su micrositio.
-- ---------------------------------------------------------------------
CREATE TABLE tenant_payment_settings (
  tenant_id          UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  enabled            BOOLEAN NOT NULL DEFAULT false,
  wompi_environment  TEXT NOT NULL DEFAULT 'test' CHECK (wompi_environment IN ('test', 'prod')),
  wompi_public_key   TEXT,
  wompi_integrity_enc TEXT,
  wompi_events_enc   TEXT,
  -- 'full' = cobra el valor del servicio; 'deposit' = cobra un anticipo (%)
  charge_mode        TEXT NOT NULL DEFAULT 'full' CHECK (charge_mode IN ('full', 'deposit')),
  deposit_pct        SMALLINT NOT NULL DEFAULT 30 CHECK (deposit_pct BETWEEN 1 AND 100),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE appointment_payments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  appointment_id   UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  reference        TEXT NOT NULL UNIQUE,
  amount_in_cents  INTEGER NOT NULL CHECK (amount_in_cents > 0),
  currency         TEXT NOT NULL DEFAULT 'COP',
  status           TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'approved', 'declined', 'voided', 'error')),
  wompi_transaction_id TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX appointment_payments_appt_idx ON appointment_payments (appointment_id);
CREATE INDEX appointment_payments_tenant_idx ON appointment_payments (tenant_id, created_at);

ALTER TABLE appointments
  ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'none'
    CHECK (payment_status IN ('none', 'pending', 'paid'));

-- ---------------------------------------------------------------------
-- Funcionalidades por defecto de los planes existentes (no pisa las que ya existan).
-- ---------------------------------------------------------------------
UPDATE plans SET features = jsonb_build_object(
    'waitlist', true, 'reviews', true, 'loyalty', true, 'reminders', true,
    'staff_photos', true, 'online_payment', false, 'reports', false, 'featured', false
  ) || features;
