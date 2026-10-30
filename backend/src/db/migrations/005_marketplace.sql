-- =====================================================================
-- Migración 005: directorio público de negocios (comunidad), autogestión
-- del perfil del negocio, carga de imágenes y cuentas de cliente globales.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Categorías (tipos de negocio) para buscar en el directorio.
-- ---------------------------------------------------------------------
CREATE TABLE business_categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  icon        TEXT NOT NULL DEFAULT 'store',   -- nombre del icono del front
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO business_categories (slug, name, icon, sort_order) VALUES
  ('barberia',          'Barbería',               'scissors',    1),
  ('peluqueria-belleza','Peluquería y belleza',   'sparkles',    2),
  ('unas',              'Uñas y manicure',        'hand',        3),
  ('spa-bienestar',     'Spa y bienestar',        'leaf',        4),
  ('salud',             'Salud y consultorios',   'stethoscope', 5),
  ('odontologia',       'Odontología',            'smile',       6),
  ('veterinaria',       'Veterinaria y mascotas', 'paw',         7),
  ('fitness',           'Gimnasio y entrenamiento','dumbbell',   8),
  ('automotriz',        'Taller y lavadero',      'wrench',      9),
  ('asesorias',         'Asesorías y servicios',  'briefcase',  10),
  ('otros',             'Otros',                  'store',      99)
ON CONFLICT (slug) DO NOTHING;

-- ---------------------------------------------------------------------
-- Perfil público del negocio
-- ---------------------------------------------------------------------
ALTER TABLE tenants
  ADD COLUMN category_id UUID REFERENCES business_categories(id) ON DELETE SET NULL,
  ADD COLUMN city        TEXT,
  ADD COLUMN latitude    DOUBLE PRECISION CHECK (latitude BETWEEN -90 AND 90),
  ADD COLUMN longitude   DOUBLE PRECISION CHECK (longitude BETWEEN -180 AND 180),
  ADD COLUMN tagline     TEXT,                              -- frase corta para la tarjeta
  ADD COLUMN is_listed   BOOLEAN NOT NULL DEFAULT true;     -- visible en el directorio

CREATE INDEX tenants_directory_idx ON tenants (status, is_listed, category_id);
CREATE INDEX tenants_city_idx ON tenants (lower(city));

ALTER TABLE tenant_branding
  ADD COLUMN cover_url TEXT,
  ADD COLUMN instagram TEXT,
  ADD COLUMN website   TEXT;

-- ---------------------------------------------------------------------
-- Marca de la plataforma: color secundario y frase.
-- ---------------------------------------------------------------------
ALTER TABLE platform_branding
  ADD COLUMN secondary_color TEXT NOT NULL DEFAULT '#203CB3',
  ADD COLUMN tagline TEXT;
-- Alinea el color por defecto con la interfaz actual.
UPDATE platform_branding SET primary_color = '#3458E8' WHERE id = 1 AND primary_color = '#2563EB';

-- ---------------------------------------------------------------------
-- Imágenes cargadas desde el equipo (logo, portada, logo de plataforma).
-- Se guardan en Postgres para no depender de volúmenes en Coolify.
-- ---------------------------------------------------------------------
CREATE TABLE media_assets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID REFERENCES tenants(id) ON DELETE CASCADE,   -- NULL = plataforma
  uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('logo', 'cover', 'platform_logo')),
  mime        TEXT NOT NULL CHECK (mime IN ('image/png', 'image/jpeg', 'image/webp')),
  size_bytes  INTEGER NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 2097152),
  data        BYTEA NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX media_assets_owner_idx ON media_assets (tenant_id, kind, created_at);

-- ---------------------------------------------------------------------
-- Cuentas de cliente globales: un cliente usa la misma cuenta en todos
-- los negocios. Esta tabla registra en qué negocios ha estado.
-- Los clientes creados antes de esta migración conservan su tenant_id.
-- ---------------------------------------------------------------------
CREATE TABLE customer_businesses (
  customer_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (customer_id, tenant_id)
);
CREATE INDEX customer_businesses_tenant_idx ON customer_businesses (tenant_id);

INSERT INTO customer_businesses (customer_id, tenant_id, first_seen_at, last_seen_at)
SELECT id, tenant_id, created_at, created_at
  FROM users WHERE role = 'customer' AND tenant_id IS NOT NULL
ON CONFLICT DO NOTHING;
