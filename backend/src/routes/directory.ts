/**
 * Directorio público de negocios (la "comunidad" de TurnosYa). Sin login.
 *  - GET /api/directory/categories   tipos de negocio con cantidad de negocios
 *  - GET /api/directory/cities       ciudades con negocios publicados
 *  - GET /api/directory/businesses   búsqueda por texto, categoría, ciudad y cercanía (GPS)
 *
 * Solo aparecen negocios activos, publicados (is_listed) y con suscripción no cancelada.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query } from '../db/pool.ts';
import { parseOr400 } from '../lib/validation.ts';

const searchSchema = z.object({
  q: z.string().trim().max(80).optional(),
  category: z.string().trim().max(60).optional(),
  city: z.string().trim().max(80).optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  radiusKm: z.coerce.number().positive().max(500).optional(),
  sort: z.enum(['relevance', 'distance', 'rating', 'new']).default('relevance'),
  limit: z.coerce.number().int().min(1).max(48).default(24),
  offset: z.coerce.number().int().min(0).max(5000).default(0),
});

/** Condición base de visibilidad en el directorio. */
const VISIBLE = `t.status = 'active' AND t.is_listed = true
  AND COALESCE((SELECT s.status FROM subscriptions s WHERE s.tenant_id = t.id), 'trial') <> 'cancelled'`;

/** Escapa comodines de LIKE en el texto que escribe el visitante. */
function likePattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

export default async function directoryRoutes(app: FastifyInstance): Promise<void> {
  app.get('/categories', async () => {
    const { rows } = await query(
      `SELECT c.id, c.slug, c.name, c.icon,
              (SELECT count(*) FROM tenants t WHERE t.category_id = c.id AND ${VISIBLE})::int AS count
         FROM business_categories c
        WHERE c.is_active = true
        ORDER BY c.sort_order, c.name`,
    );
    return rows;
  });

  app.get('/cities', async () => {
    const { rows } = await query(
      `SELECT min(trim(t.city)) AS city, count(*)::int AS count
         FROM tenants t
        WHERE t.city IS NOT NULL AND trim(t.city) <> '' AND ${VISIBLE}
        GROUP BY lower(trim(t.city))
        ORDER BY count DESC, city
        LIMIT 100`,
    );
    return rows;
  });

  app.get('/businesses', async (req, reply) => {
    const f = parseOr400(searchSchema, req.query, reply);
    if (!f) return;

    const params: unknown[] = [];
    const p = (v: unknown): string => {
      params.push(v);
      return `$${params.length}`;
    };

    const where: string[] = [VISIBLE];
    const hasGeo = f.lat !== undefined && f.lng !== undefined;

    if (f.q) {
      const like = p(likePattern(f.q.toLowerCase()));
      where.push(`(lower(t.name) LIKE ${like} OR lower(coalesce(t.city,'')) LIKE ${like}
                   OR lower(coalesce(t.tagline,'')) LIKE ${like}
                   OR lower(coalesce(b.about,'')) LIKE ${like}
                   OR lower(coalesce(c.name,'')) LIKE ${like}
                   OR EXISTS (SELECT 1 FROM services sv WHERE sv.tenant_id = t.id AND sv.is_active
                              AND lower(sv.name) LIKE ${like}))`);
    }
    if (f.category) where.push(`c.slug = ${p(f.category)}`);
    if (f.city) where.push(`lower(trim(t.city)) = lower(${p(f.city)})`);

    // Distancia en km (fórmula de Haversine). NULL si el negocio no tiene ubicación.
    let distanceSql = 'NULL::double precision';
    if (hasGeo) {
      const lat = p(f.lat);
      const lng = p(f.lng);
      distanceSql = `CASE WHEN t.latitude IS NULL OR t.longitude IS NULL THEN NULL ELSE
        6371 * 2 * asin(sqrt(
          power(sin(radians((${lat})::double precision - t.latitude) / 2), 2) +
          cos(radians(t.latitude)) * cos(radians((${lat})::double precision)) *
          power(sin(radians((${lng})::double precision - t.longitude) / 2), 2)
        )) END`;
    }

    const sortGeo = hasGeo && (f.sort === 'distance' || f.sort === 'relevance');
    // Columnas del subquery "x".
    const orderBy = sortGeo
      ? 'x.distance_km ASC NULLS LAST, x.rating DESC NULLS LAST, x.name'
      : f.sort === 'rating'
        ? 'x.rating DESC NULLS LAST, x.reviews DESC, x.name'
        : f.sort === 'new'
          ? 'x.created_at DESC'
          : '(x.services_count > 0) DESC, (x.logo_url IS NOT NULL) DESC, x.rating DESC NULLS LAST, x.created_at DESC';

    const inner = `
      SELECT t.id, t.slug, t.name, t.city, t.tagline, t.created_at,
             t.latitude, t.longitude,
             c.slug AS category_slug, c.name AS category_name, c.icon AS category_icon,
             b.logo_url, b.cover_url, b.primary_color, b.secondary_color, b.address, b.about,
             b.whatsapp_number,
             (SELECT round(avg(r.rating)::numeric, 1) FROM reviews r WHERE r.tenant_id = t.id)::float AS rating,
             (SELECT count(*) FROM reviews r WHERE r.tenant_id = t.id)::int AS reviews,
             (SELECT count(*) FROM services sv WHERE sv.tenant_id = t.id AND sv.is_active)::int AS services_count,
             (SELECT min(sv.price_cop) FROM services sv WHERE sv.tenant_id = t.id AND sv.is_active AND sv.price_cop > 0)::int AS min_price,
             ${distanceSql} AS distance_km
        FROM tenants t
        LEFT JOIN business_categories c ON c.id = t.category_id
        LEFT JOIN tenant_branding b ON b.tenant_id = t.id
       WHERE ${where.join(' AND ')}`;

    const radiusFilter = hasGeo && f.radiusKm ? `WHERE x.distance_km <= ${p(f.radiusKm)}` : '';
    const limit = p(f.limit);
    const offset = p(f.offset);

    const { rows } = await query<Record<string, unknown>>(
      `SELECT x.*, count(*) OVER()::int AS total
         FROM (${inner}) x
         ${radiusFilter}
        ORDER BY ${orderBy}
        LIMIT ${limit} OFFSET ${offset}`,
      params,
    );

    const total = (rows[0]?.total as number | undefined) ?? 0;
    return {
      total,
      items: rows.map((r) => ({
        slug: r.slug,
        name: r.name,
        city: r.city,
        tagline: r.tagline,
        address: r.address,
        about: typeof r.about === 'string' ? (r.about as string).slice(0, 180) : null,
        category: r.category_slug
          ? { slug: r.category_slug, name: r.category_name, icon: r.category_icon }
          : null,
        logoUrl: r.logo_url,
        coverUrl: r.cover_url,
        primaryColor: r.primary_color ?? '#3458E8',
        secondaryColor: r.secondary_color ?? '#203CB3',
        rating: r.rating,
        reviews: r.reviews,
        servicesCount: r.services_count,
        minPrice: r.min_price,
        hasLocation: r.latitude !== null && r.longitude !== null,
        distanceKm: r.distance_km === null ? null : Math.round((r.distance_km as number) * 10) / 10,
        hasWhatsapp: Boolean(r.whatsapp_number),
        createdAt: r.created_at,
      })),
    };
  });
}
