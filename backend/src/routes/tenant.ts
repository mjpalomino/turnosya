/**
 * Autogestión del dueño del sitio (owner): perfil, link, branding, ajustes,
 * sedes, resumen, agenda completa y clientes.
 *  - GET/PUT  /api/tenant/profile            nombre, link (slug), categoría, ciudad, ubicación, visibilidad
 *  - GET      /api/tenant/slug-available/:slug
 *  - GET      /api/tenant/onboarding         lista de pasos para completar el negocio
 *  - GET/PUT  /api/tenant/branding
 *  - GET/PUT  /api/tenant/settings
 *  - GET/POST /api/tenant/branches
 *  - GET      /api/tenant/summary
 *  - GET      /api/tenant/appointments?from&to
 *  - GET      /api/tenant/customers
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query } from '../db/pool.ts';
import { hexColorSchema, imageUrlSchema, isReservedSlug, parseOr400, slugSchema } from '../lib/validation.ts';

const emptyToNull = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v);

const brandingSchema = z.object({
  logoUrl: z.preprocess(emptyToNull, imageUrlSchema.nullable().optional()),
  coverUrl: z.preprocess(emptyToNull, imageUrlSchema.nullable().optional()),
  primaryColor: hexColorSchema,
  secondaryColor: hexColorSchema,
  phone: z.preprocess(emptyToNull, z.string().max(30).nullable().optional()),
  whatsappNumber: z.preprocess(
    (v) => (typeof v === 'string' ? (v.replace(/[^\d]/g, '') || null) : v),
    z.string().min(7).max(15).nullable().optional(),
  ),
  email: z.preprocess(emptyToNull, z.string().email().nullable().optional()),
  address: z.preprocess(emptyToNull, z.string().max(200).nullable().optional()),
  about: z.preprocess(emptyToNull, z.string().max(1000).nullable().optional()),
  instagram: z.preprocess(emptyToNull, z.string().max(100).nullable().optional()),
  website: z.preprocess(emptyToNull, z.string().max(200).regex(/^https?:\/\//i, 'Debe iniciar con http:// o https://').nullable().optional()),
});

const profileSchema = z.object({
  name: z.string().trim().min(2).max(100),
  slug: slugSchema,
  categoryId: z.string().uuid().nullable().optional(),
  city: z.preprocess(emptyToNull, z.string().trim().max(80).nullable().optional()),
  tagline: z.preprocess(emptyToNull, z.string().trim().max(120).nullable().optional()),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  isListed: z.boolean(),
});

const settingsSchema = z.object({
  minLeadMinutes: z.number().int().min(0).max(10080),
  cancelLeadMinutes: z.number().int().min(0).max(10080),
  slotMinutes: z.number().int().min(5).max(240),
  allowWaitlist: z.boolean(),
  allowReviews: z.boolean(),
  onlinePayment: z.boolean(),
});

const branchSchema = z.object({
  name: z.string().min(1).max(100),
  address: z.string().max(200).optional(),
  phone: z.string().max(30).optional(),
});

const rangeSchema = z.object({ from: z.string().datetime(), to: z.string().datetime() });

export default async function tenantRoutes(app: FastifyInstance): Promise<void> {
  const owner = { preHandler: [app.requireRole('owner')] };

  // --- Perfil y link del negocio ---
  app.get('/profile', owner, async (req) => {
    const { rows } = await query(
      `SELECT t.name, t.slug, t.category_id AS "categoryId", t.city, t.tagline,
              t.latitude, t.longitude, t.is_listed AS "isListed", t.status
         FROM tenants t WHERE t.id=$1`,
      [req.user.tenantId],
    );
    return rows[0] ?? null;
  });

  app.put('/profile', owner, async (req, reply) => {
    const b = parseOr400(profileSchema, req.body, reply);
    if (!b) return;
    const taken = await query('SELECT 1 FROM tenants WHERE slug=$1 AND id<>$2', [b.slug, req.user.tenantId]);
    if (taken.rowCount) return reply.code(409).send({ error: 'Ese link ya lo usa otro negocio' });
    const bothCoords = b.latitude != null && b.longitude != null;
    try {
      await query(
        `UPDATE tenants SET name=$1, slug=$2,
                category_id=(SELECT id FROM business_categories WHERE id=$3),
                city=$4, tagline=$5, latitude=$6, longitude=$7, is_listed=$8
          WHERE id=$9`,
        [b.name, b.slug, b.categoryId ?? null, b.city ?? null, b.tagline ?? null,
         bothCoords ? b.latitude : null, bothCoords ? b.longitude : null, b.isListed, req.user.tenantId],
      );
    } catch (err) {
      if ((err as { code?: string }).code === '23505') {
        return reply.code(409).send({ error: 'Ese link ya lo usa otro negocio' });
      }
      throw err;
    }
    return { ok: true, slug: b.slug };
  });

  app.get('/slug-available/:slug', owner, async (req) => {
    const slug = String((req.params as { slug: string }).slug).toLowerCase();
    const valid = slugSchema.safeParse(slug);
    if (!valid.success) {
      return { slug, available: false, reason: isReservedSlug(slug) ? 'reserved' : 'invalid' };
    }
    const { rowCount } = await query('SELECT 1 FROM tenants WHERE slug=$1 AND id<>$2', [slug, req.user.tenantId]);
    return { slug, available: rowCount === 0, reason: rowCount ? 'taken' : null };
  });

  app.get('/onboarding', owner, async (req) => {
    const { rows } = await query<Record<string, boolean | number>>(
      `SELECT (b.logo_url IS NOT NULL) AS "hasLogo",
              (t.category_id IS NOT NULL) AS "hasCategory",
              (t.latitude IS NOT NULL OR coalesce(b.address,'') <> '') AS "hasLocation",
              (coalesce(b.whatsapp_number,'') <> '' OR coalesce(b.phone,'') <> '') AS "hasContact",
              (SELECT count(*) FROM services s WHERE s.tenant_id=t.id AND s.is_active)::int AS services,
              (SELECT count(DISTINCT sp.id) FROM staff_profiles sp
                 JOIN staff_schedules ss ON ss.staff_id=sp.id
                 JOIN staff_services sv ON sv.staff_id=sp.id
                WHERE sp.tenant_id=t.id AND sp.is_active)::int AS "bookableStaff",
              t.is_listed AS "isListed"
         FROM tenants t LEFT JOIN tenant_branding b ON b.tenant_id=t.id
        WHERE t.id=$1`,
      [req.user.tenantId],
    );
    return rows[0];
  });

  app.get('/branding', owner, async (req) => {
    const { rows } = await query(
      `SELECT logo_url AS "logoUrl", cover_url AS "coverUrl", primary_color AS "primaryColor",
              secondary_color AS "secondaryColor", phone, whatsapp_number AS "whatsappNumber",
              email, address, about, instagram, website
       FROM tenant_branding WHERE tenant_id=$1`,
      [req.user.tenantId],
    );
    return rows[0] ?? null;
  });

  app.put('/branding', owner, async (req, reply) => {
    const b = parseOr400(brandingSchema, req.body, reply);
    if (!b) return;
    await query(
      `INSERT INTO tenant_branding (tenant_id, logo_url, cover_url, primary_color, secondary_color,
              phone, whatsapp_number, email, address, about, instagram, website, updated_at)
       VALUES ($12,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, now())
       ON CONFLICT (tenant_id) DO UPDATE SET logo_url=EXCLUDED.logo_url, cover_url=EXCLUDED.cover_url,
              primary_color=EXCLUDED.primary_color, secondary_color=EXCLUDED.secondary_color,
              phone=EXCLUDED.phone, whatsapp_number=EXCLUDED.whatsapp_number, email=EXCLUDED.email,
              address=EXCLUDED.address, about=EXCLUDED.about, instagram=EXCLUDED.instagram,
              website=EXCLUDED.website, updated_at=now()`,
      [b.logoUrl ?? null, b.coverUrl ?? null, b.primaryColor, b.secondaryColor, b.phone ?? null,
       b.whatsappNumber ?? null, b.email ?? null, b.address ?? null, b.about ?? null,
       b.instagram ?? null, b.website ?? null, req.user.tenantId],
    );
    return { ok: true };
  });

  app.get('/settings', owner, async (req) => {
    const { rows } = await query(
      `SELECT min_lead_minutes AS "minLeadMinutes", cancel_lead_minutes AS "cancelLeadMinutes",
              slot_minutes AS "slotMinutes", allow_waitlist AS "allowWaitlist",
              allow_reviews AS "allowReviews", online_payment AS "onlinePayment"
       FROM tenant_settings WHERE tenant_id=$1`,
      [req.user.tenantId],
    );
    return rows[0] ?? null;
  });

  app.put('/settings', owner, async (req, reply) => {
    const b = parseOr400(settingsSchema, req.body, reply);
    if (!b) return;
    await query(
      `UPDATE tenant_settings SET min_lead_minutes=$1, cancel_lead_minutes=$2, slot_minutes=$3,
              allow_waitlist=$4, allow_reviews=$5, online_payment=$6, updated_at=now()
       WHERE tenant_id=$7`,
      [b.minLeadMinutes, b.cancelLeadMinutes, b.slotMinutes, b.allowWaitlist, b.allowReviews, b.onlinePayment, req.user.tenantId],
    );
    return { ok: true };
  });

  app.get('/branches', owner, async (req) => {
    const { rows } = await query(
      `SELECT id, name, address, phone, is_active AS "isActive"
       FROM branches WHERE tenant_id=$1 ORDER BY name`,
      [req.user.tenantId],
    );
    return rows;
  });

  app.post('/branches', owner, async (req, reply) => {
    const b = parseOr400(branchSchema, req.body, reply);
    if (!b) return;
    const { rows } = await query(
      `INSERT INTO branches (tenant_id, name, address, phone) VALUES ($1,$2,$3,$4) RETURNING id`,
      [req.user.tenantId, b.name, b.address ?? null, b.phone ?? null],
    );
    return reply.code(201).send({ id: rows[0]!.id });
  });

  app.get('/summary', owner, async (req) => {
    const { rows } = await query<{ today: number; upcoming: number; staff: number; services: number }>(
      `SELECT
         (SELECT count(*) FROM appointments
            WHERE tenant_id=$1 AND starts_at::date = now()::date
              AND status IN ('booked','confirmed'))::int AS today,
         (SELECT count(*) FROM appointments
            WHERE tenant_id=$1 AND starts_at > now()
              AND status IN ('booked','confirmed'))::int AS upcoming,
         (SELECT count(*) FROM staff_profiles WHERE tenant_id=$1 AND is_active=true)::int AS staff,
         (SELECT count(*) FROM services WHERE tenant_id=$1 AND is_active=true)::int AS services`,
      [req.user.tenantId],
    );
    return rows[0];
  });

  app.get('/appointments', owner, async (req, reply) => {
    const q = parseOr400(rangeSchema, req.query, reply);
    if (!q) return;
    const { rows } = await query(
      `SELECT a.id, a.starts_at AS "startsAt", a.ends_at AS "endsAt", a.status,
              a.customer_name AS "customerName", a.customer_phone AS "customerPhone",
              s.name AS "serviceName", u.full_name AS "staffName"
       FROM appointments a
       JOIN services s ON s.id = a.service_id
       JOIN staff_profiles sp ON sp.id = a.staff_id
       JOIN users u ON u.id = sp.user_id
       WHERE a.tenant_id=$1 AND a.starts_at >= $2 AND a.starts_at < $3
       ORDER BY a.starts_at`,
      [req.user.tenantId, q.from, q.to],
    );
    return rows;
  });

  app.get('/customers', owner, async (req) => {
    const { rows } = await query(
      `SELECT u.id, u.full_name AS "fullName", u.email, u.phone, u.created_at AS "createdAt"
         FROM users u
        WHERE u.role='customer' AND (
              u.tenant_id=$1
           OR EXISTS (SELECT 1 FROM customer_businesses cb WHERE cb.customer_id=u.id AND cb.tenant_id=$1)
           OR EXISTS (SELECT 1 FROM appointments a WHERE a.customer_id=u.id AND a.tenant_id=$1))
        ORDER BY u.full_name`,
      [req.user.tenantId],
    );
    return rows;
  });
}
