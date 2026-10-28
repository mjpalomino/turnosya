/**
 * Autogestión del dueño del sitio (owner): branding, ajustes, sedes,
 * resumen, agenda completa y clientes.
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
import { parseOr400 } from '../lib/validation.ts';

const brandingSchema = z.object({
  logoUrl: z.string().url().nullable().optional(),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  secondaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  phone: z.string().max(30).nullable().optional(),
  whatsappNumber: z.string().max(30).nullable().optional(),
  email: z.string().email().nullable().optional(),
  address: z.string().max(200).nullable().optional(),
  about: z.string().max(1000).nullable().optional(),
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

  app.get('/branding', owner, async (req) => {
    const { rows } = await query(
      `SELECT logo_url AS "logoUrl", primary_color AS "primaryColor",
              secondary_color AS "secondaryColor", phone, whatsapp_number AS "whatsappNumber",
              email, address, about
       FROM tenant_branding WHERE tenant_id=$1`,
      [req.user.tenantId],
    );
    return rows[0] ?? null;
  });

  app.put('/branding', owner, async (req, reply) => {
    const b = parseOr400(brandingSchema, req.body, reply);
    if (!b) return;
    await query(
      `UPDATE tenant_branding SET logo_url=$1, primary_color=$2, secondary_color=$3,
              phone=$4, whatsapp_number=$5, email=$6, address=$7, about=$8, updated_at=now()
       WHERE tenant_id=$9`,
      [b.logoUrl ?? null, b.primaryColor, b.secondaryColor, b.phone ?? null, b.whatsappNumber ?? null,
       b.email ?? null, b.address ?? null, b.about ?? null, req.user.tenantId],
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
      `SELECT id, full_name AS "fullName", email, phone, created_at AS "createdAt"
       FROM users WHERE tenant_id=$1 AND role='customer' ORDER BY full_name`,
      [req.user.tenantId],
    );
    return rows;
  });
}
