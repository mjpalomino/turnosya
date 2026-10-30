/**
 * Cuenta y citas del cliente final.
 *  - POST /api/customer/register/:slug   crear cuenta de cliente (global) desde el link de un negocio
 *  - GET  /api/customer/appointments     mis citas (próximas e historial)
 *  - POST /api/customer/appointments/:id/cancel   cancelar (respeta antelación)
 *  - POST /api/customer/appointments/:id/review   calificar una cita atendida
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query } from '../db/pool.ts';
import { parseOr400 } from '../lib/validation.ts';
import { notifyAppointment } from '../lib/notify.ts';
import { createGlobalCustomer } from './auth.ts';

const registerSchema = z.object({
  fullName: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(6).max(200),
  phone: z.string().max(30).optional(),
});

const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(500).optional(),
});

export default async function customerRoutes(app: FastifyInstance): Promise<void> {
  const customer = { preHandler: [app.requireRole('customer')] };

  // Registro de cliente dentro de un negocio
  app.post('/register/:slug', async (req, reply) => {
    const slug = (req.params as { slug: string }).slug;
    const body = parseOr400(registerSchema, req.body, reply);
    if (!body) return;

    const tenant = await query<{ id: string }>(
      `SELECT id FROM tenants WHERE slug=$1 AND status='active'`,
      [slug],
    );
    if (!tenant.rowCount) return reply.code(404).send({ error: 'Sitio no encontrado' });
    const tenantId = tenant.rows[0]!.id;

    const created = await createGlobalCustomer(body, tenantId);
    if ('error' in created) return reply.code(409).send({ error: created.error });
    return reply.code(201).send({ token: app.jwt.sign(created.user), user: created.user });
  });

  // Mis citas
  app.get('/appointments', customer, async (req) => {
    const { rows } = await query(
      `SELECT a.id, a.starts_at AS "startsAt", a.ends_at AS "endsAt", a.status,
              s.name AS "serviceName", u.full_name AS "staffName",
              t.name AS "businessName", t.slug AS "businessSlug"
       FROM appointments a
       JOIN tenants t ON t.id=a.tenant_id
       JOIN services s ON s.id=a.service_id
       JOIN staff_profiles sp ON sp.id=a.staff_id
       JOIN users u ON u.id=sp.user_id
       WHERE a.customer_id=$1 ORDER BY a.starts_at DESC`,
      [req.user.id],
    );
    return rows;
  });

  // Cancelar (respeta antelación mínima del tenant)
  app.post('/appointments/:id/cancel', customer, async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const appt = await query<{ starts_at: string; tenant_id: string; status: string }>(
      `SELECT starts_at, tenant_id, status FROM appointments WHERE id=$1 AND customer_id=$2`,
      [id, req.user.id],
    );
    if (!appt.rowCount) return reply.code(404).send({ error: 'Cita no encontrada' });
    if (['cancelled', 'completed', 'no_show'].includes(appt.rows[0]!.status)) {
      return reply.code(400).send({ error: 'La cita ya no se puede cancelar' });
    }

    const settings = await query<{ cancel_lead_minutes: number }>(
      'SELECT cancel_lead_minutes FROM tenant_settings WHERE tenant_id=$1',
      [appt.rows[0]!.tenant_id],
    );
    const lead = settings.rows[0]?.cancel_lead_minutes ?? 0;
    const minsToStart = (new Date(appt.rows[0]!.starts_at).getTime() - Date.now()) / 60000;
    if (minsToStart < lead) {
      return reply.code(400).send({ error: `Debes cancelar con al menos ${lead} minutos de antelación` });
    }

    await query(`UPDATE appointments SET status='cancelled' WHERE id=$1`, [id]);
    void notifyAppointment(id, 'cancelled');
    return { ok: true };
  });

  // Reseña de una cita atendida
  app.post('/appointments/:id/review', customer, async (req, reply) => {
    const body = parseOr400(reviewSchema, req.body, reply);
    if (!body) return;
    const id = (req.params as { id: string }).id;
    const appt = await query<{ tenant_id: string; status: string }>(
      `SELECT tenant_id, status FROM appointments WHERE id=$1 AND customer_id=$2`,
      [id, req.user.id],
    );
    if (!appt.rowCount) return reply.code(404).send({ error: 'Cita no encontrada' });
    if (appt.rows[0]!.status !== 'completed') {
      return reply.code(400).send({ error: 'Solo puedes calificar citas atendidas' });
    }
    try {
      await query(
        `INSERT INTO reviews (tenant_id, appointment_id, rating, comment) VALUES ($1,$2,$3,$4)`,
        [appt.rows[0]!.tenant_id, id, body.rating, body.comment ?? null],
      );
    } catch {
      return reply.code(409).send({ error: 'Esta cita ya fue calificada' });
    }
    return { ok: true };
  });
}
