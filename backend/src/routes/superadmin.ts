/**
 * Panel del superadministrador de la plataforma.
 *  - GET/POST/PUT   /api/admin/plans             CRUD de planes
 *  - GET            /api/admin/tenants           lista de negocios + suscripción
 *  - POST           /api/admin/tenants/:id/status  activar/suspender
 *  - POST           /api/admin/tenants/:id/subscription  cambiar plan/estado/vencimiento
 *  - GET/PUT        /api/admin/branding          marca de la plataforma
 *  - GET            /api/admin/metrics           métricas globales
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query } from '../db/pool.ts';
import { hexColorSchema, imageUrlSchema, parseOr400 } from '../lib/validation.ts';

const planSchema = z.object({
  name: z.string().min(1).max(60),
  priceCop: z.number().int().min(0),
  maxStaff: z.number().int().min(0),
  maxBranches: z.number().int().min(1),
  maxServices: z.number().int().min(1),
  features: z.record(z.string(), z.unknown()).default({}),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

const statusSchema = z.object({ status: z.enum(['active', 'suspended']) });

const subSchema = z.object({
  planId: z.string().uuid().nullable().optional(),
  status: z.enum(['trial', 'active', 'past_due', 'cancelled']),
  currentPeriodEnd: z.string().datetime().nullable().optional(),
});

const brandingSchema = z.object({
  brandName: z.string().trim().min(1).max(60),
  logoUrl: imageUrlSchema.nullable().optional(),
  primaryColor: hexColorSchema,
  secondaryColor: hexColorSchema,
  tagline: z.string().trim().max(140).nullable().optional(),
});

export default async function superadminRoutes(app: FastifyInstance): Promise<void> {
  const sa = { preHandler: [app.requireRole('superadmin')] };

  // --- Planes ---
  app.get('/plans', sa, async () => {
    const { rows } = await query(
      `SELECT id, name, price_cop AS "priceCop", max_staff AS "maxStaff",
              max_branches AS "maxBranches", max_services AS "maxServices",
              features, is_active AS "isActive", sort_order AS "sortOrder"
       FROM plans ORDER BY sort_order, name`,
    );
    return rows;
  });

  app.post('/plans', sa, async (req, reply) => {
    const b = parseOr400(planSchema, req.body, reply);
    if (!b) return;
    const { rows } = await query(
      `INSERT INTO plans (name, price_cop, max_staff, max_branches, max_services, features, is_active, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [b.name, b.priceCop, b.maxStaff, b.maxBranches, b.maxServices, JSON.stringify(b.features), b.isActive, b.sortOrder],
    );
    return reply.code(201).send({ id: rows[0]!.id });
  });

  app.put('/plans/:id', sa, async (req, reply) => {
    const b = parseOr400(planSchema, req.body, reply);
    if (!b) return;
    const id = (req.params as { id: string }).id;
    const { rowCount } = await query(
      `UPDATE plans SET name=$1, price_cop=$2, max_staff=$3, max_branches=$4,
              max_services=$5, features=$6, is_active=$7, sort_order=$8 WHERE id=$9`,
      [b.name, b.priceCop, b.maxStaff, b.maxBranches, b.maxServices, JSON.stringify(b.features), b.isActive, b.sortOrder, id],
    );
    if (!rowCount) return reply.code(404).send({ error: 'No encontrado' });
    return { ok: true };
  });

  // --- Negocios / suscriptores ---
  app.get('/tenants', sa, async () => {
    const { rows } = await query(
      `SELECT t.id, t.slug, t.name, t.status, t.created_at AS "createdAt",
              s.status AS "subStatus", s.trial_ends_at AS "trialEndsAt",
              s.current_period_end AS "currentPeriodEnd", p.name AS "planName",
              t.city, t.is_listed AS "isListed", c.name AS "categoryName"
       FROM tenants t
       LEFT JOIN subscriptions s ON s.tenant_id = t.id
       LEFT JOIN plans p ON p.id = s.plan_id
       LEFT JOIN business_categories c ON c.id = t.category_id
       ORDER BY t.created_at DESC`,
    );
    return rows;
  });

  app.post('/tenants/:id/status', sa, async (req, reply) => {
    const b = parseOr400(statusSchema, req.body, reply);
    if (!b) return;
    const id = (req.params as { id: string }).id;
    const { rowCount } = await query('UPDATE tenants SET status=$1 WHERE id=$2', [b.status, id]);
    if (!rowCount) return reply.code(404).send({ error: 'No encontrado' });
    return { ok: true };
  });

  app.post('/tenants/:id/subscription', sa, async (req, reply) => {
    const b = parseOr400(subSchema, req.body, reply);
    if (!b) return;
    const id = (req.params as { id: string }).id;
    const { rowCount } = await query(
      `UPDATE subscriptions SET plan_id=$1, status=$2, current_period_end=$3, updated_at=now()
       WHERE tenant_id=$4`,
      [b.planId ?? null, b.status, b.currentPeriodEnd ?? null, id],
    );
    if (!rowCount) return reply.code(404).send({ error: 'No encontrado' });
    return { ok: true };
  });

  // --- Marca de la plataforma ---
  app.get('/branding', sa, async () => {
    const { rows } = await query(
      `SELECT brand_name AS "brandName", logo_url AS "logoUrl", primary_color AS "primaryColor",
              secondary_color AS "secondaryColor", tagline
       FROM platform_branding WHERE id=1`,
    );
    return rows[0];
  });

  app.put('/branding', sa, async (req, reply) => {
    const b = parseOr400(brandingSchema, req.body, reply);
    if (!b) return;
    await query(
      `UPDATE platform_branding SET brand_name=$1, logo_url=$2, primary_color=$3,
              secondary_color=$4, tagline=$5, updated_at=now() WHERE id=1`,
      [b.brandName, b.logoUrl ?? null, b.primaryColor, b.secondaryColor, b.tagline || null],
    );
    return { ok: true };
  });

  // --- Métricas ---
  app.get('/metrics', sa, async () => {
    const totals = await query<{
      tenants: number;
      active: number;
      appts: number;
    }>(
      `SELECT
         (SELECT count(*) FROM tenants)::int AS tenants,
         (SELECT count(*) FROM tenants WHERE status='active')::int AS active,
         (SELECT count(*) FROM appointments WHERE created_at > now() - interval '30 days')::int AS appts`,
    );
    const byStatus = await query(
      `SELECT status, count(*)::int AS n FROM subscriptions GROUP BY status`,
    );
    return { ...totals.rows[0], subscriptions: byStatus.rows };
  });
}
