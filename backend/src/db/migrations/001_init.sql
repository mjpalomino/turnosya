-- =====================================================================
-- Migración 001: esquema inicial de TurnosYa
-- SaaS multi-inquilino de citas/turnos.
-- =====================================================================

-- Extensiones
CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- gen_random_uuid()

-- ---------------------------------------------------------------------
-- PLATAFORMA (superadmin)
-- ---------------------------------------------------------------------

-- Marca global de la plataforma (una sola fila id=1).
CREATE TABLE platform_branding (
  id            SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  brand_name    TEXT NOT NULL DEFAULT 'TurnosYa',
  logo_url      TEXT,
  primary_color TEXT NOT NULL DEFAULT '#2563EB',
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO platform_branding (id) VALUES (1) ON CONFLICT DO NOTHING;

-- Planes de suscripción que gestiona el superadmin.
CREATE TABLE plans (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT NOT NULL,
  price_cop      INTEGER NOT NULL CHECK (price_cop >= 0),
  max_staff      INTEGER NOT NULL DEFAULT 3 CHECK (max_staff >= 0),
  max_branches   INTEGER NOT NULL DEFAULT 1 CHECK (max_branches >= 1),
  max_services   INTEGER NOT NULL DEFAULT 20 CHECK (max_services >= 1),
  features       JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active      BOOLEAN NOT NULL DEFAULT true,
  sort_order     INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- TENANTS (negocios / sitios)
-- ---------------------------------------------------------------------

CREATE TABLE tenants (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          TEXT NOT NULL UNIQUE,              -- /sitio/:slug
  name          TEXT NOT NULL,
  timezone      TEXT NOT NULL DEFAULT 'America/Bogota',
  status        TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'suspended')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Branding y datos de contacto que el dueño autogestiona.
CREATE TABLE tenant_branding (
  tenant_id       UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  logo_url        TEXT,
  primary_color   TEXT NOT NULL DEFAULT '#2563EB',
  secondary_color TEXT NOT NULL DEFAULT '#1E40AF',
  phone           TEXT,
  whatsapp_number TEXT,
  email           TEXT,
  address         TEXT,
  about           TEXT,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Reglas de reserva por tenant.
CREATE TABLE tenant_settings (
  tenant_id            UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  min_lead_minutes     INTEGER NOT NULL DEFAULT 60,   -- antelación mínima para reservar
  cancel_lead_minutes  INTEGER NOT NULL DEFAULT 120,  -- antelación mínima para cancelar
  slot_minutes         INTEGER NOT NULL DEFAULT 30,   -- granularidad de los turnos
  allow_waitlist       BOOLEAN NOT NULL DEFAULT true,
  allow_reviews        BOOLEAN NOT NULL DEFAULT true,
  online_payment       BOOLEAN NOT NULL DEFAULT false,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Suscripción del tenant.
CREATE TABLE subscriptions (
  tenant_id       UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  plan_id         UUID REFERENCES plans(id),
  status          TEXT NOT NULL DEFAULT 'trial'
                    CHECK (status IN ('trial', 'active', 'past_due', 'cancelled')),
  trial_ends_at   TIMESTAMPTZ,                         -- fin de los 2 meses gratis
  current_period_end TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- USUARIOS y ROLES
-- ---------------------------------------------------------------------
-- Un usuario pertenece a la plataforma. Su rol define qué puede hacer.
--   superadmin : tenant_id NULL
--   owner/staff: tenant_id del negocio
--   customer   : tenant_id del negocio donde se registró
-- ---------------------------------------------------------------------

CREATE TABLE users (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID REFERENCES tenants(id) ON DELETE CASCADE,
  role           TEXT NOT NULL
                   CHECK (role IN ('superadmin', 'owner', 'staff', 'customer')),
  email          TEXT,
  phone          TEXT,
  full_name      TEXT NOT NULL,
  password_hash  TEXT,                                 -- NULL para clientes "sin cuenta"
  is_active      BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Email único por tenant (o global para superadmin cuando tenant_id es NULL).
CREATE UNIQUE INDEX users_tenant_email_uniq
  ON users (COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'), lower(email))
  WHERE email IS NOT NULL;
CREATE INDEX users_tenant_role_idx ON users (tenant_id, role);

-- ---------------------------------------------------------------------
-- SEDES, SERVICIOS, HORARIOS
-- ---------------------------------------------------------------------

CREATE TABLE branches (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  address     TEXT,
  phone       TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX branches_tenant_idx ON branches (tenant_id);

CREATE TABLE services (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  description      TEXT,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
  price_cop        INTEGER NOT NULL DEFAULT 0 CHECK (price_cop >= 0),
  is_active        BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX services_tenant_idx ON services (tenant_id);

-- Empleado (staff) ligado a su usuario, a una sede y a los servicios que presta.
CREATE TABLE staff_profiles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  branch_id   UUID REFERENCES branches(id) ON DELETE SET NULL,
  title       TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);
CREATE INDEX staff_tenant_idx ON staff_profiles (tenant_id);

CREATE TABLE staff_services (
  staff_id   UUID NOT NULL REFERENCES staff_profiles(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  PRIMARY KEY (staff_id, service_id)
);

-- Horario semanal recurrente del empleado (0=domingo..6=sábado).
CREATE TABLE staff_schedules (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id    UUID NOT NULL REFERENCES staff_profiles(id) ON DELETE CASCADE,
  weekday     SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time  TIME NOT NULL,
  end_time    TIME NOT NULL,
  CHECK (start_time < end_time)
);
CREATE INDEX staff_schedules_staff_idx ON staff_schedules (staff_id);

-- Bloqueos puntuales (descanso, reunión, festivo del empleado).
CREATE TABLE staff_time_off (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id    UUID NOT NULL REFERENCES staff_profiles(id) ON DELETE CASCADE,
  starts_at   TIMESTAMPTZ NOT NULL,
  ends_at     TIMESTAMPTZ NOT NULL,
  reason      TEXT,
  CHECK (starts_at < ends_at)
);
CREATE INDEX staff_time_off_staff_idx ON staff_time_off (staff_id, starts_at);

-- ---------------------------------------------------------------------
-- CITAS
-- ---------------------------------------------------------------------

CREATE TABLE appointments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id     UUID REFERENCES branches(id) ON DELETE SET NULL,
  service_id    UUID NOT NULL REFERENCES services(id),
  staff_id      UUID NOT NULL REFERENCES staff_profiles(id),
  customer_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  -- Datos de contacto por si el cliente reserva sin cuenta.
  customer_name  TEXT NOT NULL,
  customer_phone TEXT,
  customer_email TEXT,
  starts_at     TIMESTAMPTZ NOT NULL,
  ends_at       TIMESTAMPTZ NOT NULL,
  status        TEXT NOT NULL DEFAULT 'booked'
                  CHECK (status IN ('booked', 'confirmed', 'completed', 'no_show', 'cancelled')),
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (starts_at < ends_at)
);
CREATE INDEX appointments_tenant_start_idx ON appointments (tenant_id, starts_at);
CREATE INDEX appointments_staff_start_idx ON appointments (staff_id, starts_at);
CREATE INDEX appointments_customer_idx ON appointments (customer_id);
-- Evita doble reserva del mismo empleado en el mismo instante (citas vivas).
CREATE UNIQUE INDEX appointments_no_overlap_start
  ON appointments (staff_id, starts_at)
  WHERE status IN ('booked', 'confirmed');

-- Lista de espera cuando no hay cupo.
CREATE TABLE waitlist (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  service_id    UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  customer_name TEXT NOT NULL,
  customer_phone TEXT,
  desired_date  DATE NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX waitlist_tenant_date_idx ON waitlist (tenant_id, desired_date);

-- Reseñas tras la cita.
CREATE TABLE reviews (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  appointment_id UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  rating         SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment        TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (appointment_id)
);

-- ---------------------------------------------------------------------
-- FIDELIZACIÓN (tarjetas virtuales con QR)
-- ---------------------------------------------------------------------

-- Reglas por tenant.
CREATE TABLE loyalty_settings (
  tenant_id          UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  enabled            BOOLEAN NOT NULL DEFAULT false,
  stickers_for_reward INTEGER NOT NULL DEFAULT 10 CHECK (stickers_for_reward > 0),
  reward_service_id  UUID REFERENCES services(id) ON DELETE SET NULL,
  reward_label       TEXT NOT NULL DEFAULT 'Servicio gratis',
  card_expiry_days   INTEGER,  -- NULL = no vence
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tarjeta del cliente (una por cliente y tenant).
CREATE TABLE loyalty_cards (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stickers      INTEGER NOT NULL DEFAULT 0 CHECK (stickers >= 0),
  rewards_earned INTEGER NOT NULL DEFAULT 0,
  last_sticker_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, customer_id)
);

-- Tokens de un solo uso para sumar un sticker vía QR.
CREATE TABLE loyalty_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  staff_id    UUID NOT NULL REFERENCES staff_profiles(id) ON DELETE CASCADE,
  token       TEXT NOT NULL UNIQUE,         -- valor aleatorio dentro del QR
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,                  -- NULL hasta que se escanea
  used_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX loyalty_tokens_expiry_idx ON loyalty_tokens (expires_at) WHERE used_at IS NULL;

-- Historial de movimientos de la tarjeta (sticker sumado, premio canjeado).
CREATE TABLE loyalty_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id     UUID NOT NULL REFERENCES loyalty_cards(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('sticker_added', 'reward_redeemed')),
  staff_id    UUID REFERENCES staff_profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX loyalty_events_card_idx ON loyalty_events (card_id, created_at);
