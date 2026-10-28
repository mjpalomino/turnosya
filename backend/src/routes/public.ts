/**
 * Rutas públicas del sitio de cada negocio (sin login).
 *  - GET  /api/public/:slug                 branding + servicios activos
 *  - GET  /api/public/:slug/availability     huecos libres de un servicio en un día
 *  - POST /api/public/:slug/book             reservar una cita
 *
 * La disponibilidad se calcula con el horario del empleado, menos sus bloqueos
 * y menos las citas ya tomadas, en pasos de `slot_minutes`.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query, withTransaction } from '../db/pool.ts';
import { parseOr400 } from '../lib/validation.ts';
import { notifyAppointment } from '../lib/notify.ts';

const availabilitySchema = z.object({
  serviceId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  staffId: z.string().uuid().optional(),
});

const bookSchema = z.object({
  serviceId: z.string().uuid(),
  staffId: z.string().uuid(),
  startsAt: z.string().datetime(),
  customerName: z.string().min(2).max(100),
  customerPhone: z.string().max(30).optional(),
  customerEmail: z.string().email().optional(),
  notes: z.string().max(500).optional(),
});

/** Carga el tenant activo por slug o responde 404. */
async function tenantBySlug(slug: string): Promise<{ id: string; timezone: string } | null> {
  const { rows } = await query<{ id: string; timezone: string }>(
    `SELECT id, timezone FROM tenants WHERE slug=$1 AND status='active'`,
    [slug],
  );
  return rows[0] ?? null;
}

export default async function publicRoutes(app: FastifyInstance): Promise<void> {
  // Información del sitio
  app.get('/:slug', async (req, reply) => {
    const slug = (req.params as { slug: string }).slug;
    const tenant = await tenantBySlug(slug);
    if (!tenant) return reply.code(404).send({ error: 'Sitio no encontrado' });

    const branding = await query(
      `SELECT logo_url AS "logoUrl", primary_color AS "primaryColor",
              secondary_color AS "secondaryColor", phone, whatsapp_number AS "whatsappNumber",
              email, address, about
       FROM tenant_branding WHERE tenant_id=$1`,
      [tenant.id],
    );
    const services = await query(
      `SELECT id, name, description, duration_minutes AS "durationMinutes", price_cop AS "priceCop"
       FROM services WHERE tenant_id=$1 AND is_active=true ORDER BY name`,
      [tenant.id],
    );
    const name = await query('SELECT name FROM tenants WHERE id=$1', [tenant.id]);
    return {
      name: name.rows[0]!.name,
      timezone: tenant.timezone,
      branding: branding.rows[0] ?? null,
      services: services.rows,
    };
  });

  // Disponibilidad
  app.get('/:slug/availability', async (req, reply) => {
    const slug = (req.params as { slug: string }).slug;
    const q = parseOr400(availabilitySchema, req.query, reply);
    if (!q) return;
    const tenant = await tenantBySlug(slug);
    if (!tenant) return reply.code(404).send({ error: 'Sitio no encontrado' });

    const svc = await query<{ duration_minutes: number }>(
      `SELECT duration_minutes FROM services WHERE id=$1 AND tenant_id=$2 AND is_active=true`,
      [q.serviceId, tenant.id],
    );
    if (!svc.rowCount) return reply.code(404).send({ error: 'Servicio no encontrado' });
    const duration = svc.rows[0]!.duration_minutes;

    const settings = await query<{ slot_minutes: number }>(
      'SELECT slot_minutes FROM tenant_settings WHERE tenant_id=$1',
      [tenant.id],
    );
    const slotMin = settings.rows[0]?.slot_minutes ?? 30;

    // día de la semana (0=domingo) según la fecha pedida
    const weekday = new Date(`${q.date}T12:00:00Z`).getUTCDay();

    // staff que presta el servicio (o uno concreto)
    const staffRows = await query<{ id: string }>(
      q.staffId
        ? `SELECT sp.id FROM staff_profiles sp
             JOIN staff_services ss ON ss.staff_id=sp.id
            WHERE sp.id=$1 AND sp.tenant_id=$2 AND sp.is_active=true AND ss.service_id=$3`
        : `SELECT sp.id FROM staff_profiles sp
             JOIN staff_services ss ON ss.staff_id=sp.id
            WHERE sp.tenant_id=$2 AND sp.is_active=true AND ss.service_id=$3`,
      q.staffId ? [q.staffId, tenant.id, q.serviceId] : [null, tenant.id, q.serviceId],
    );

    const result: Array<{ staffId: string; slots: string[] }> = [];
    for (const { id: staffId } of staffRows.rows) {
      // ventanas de trabajo ese día
      const sched = await query<{ start_time: string; end_time: string }>(
        `SELECT start_time, end_time FROM staff_schedules WHERE staff_id=$1 AND weekday=$2`,
        [staffId, weekday],
      );
      if (!sched.rowCount) continue;

      // citas y bloqueos de ese día
      const busy = await query<{ starts_at: string; ends_at: string }>(
        `SELECT starts_at, ends_at FROM appointments
          WHERE staff_id=$1 AND status IN ('booked','confirmed')
            AND starts_at::date = $2::date
         UNION ALL
         SELECT starts_at, ends_at FROM staff_time_off
          WHERE staff_id=$1 AND starts_at::date = $2::date`,
        [staffId, q.date],
      );
      const busyRanges = busy.rows.map((b) => ({
        start: new Date(b.starts_at).getTime(),
        end: new Date(b.ends_at).getTime(),
      }));

      const slots: string[] = [];
      for (const w of sched.rows) {
        let cursor = new Date(`${q.date}T${w.start_time}`);
        const windowEnd = new Date(`${q.date}T${w.end_time}`);
        while (cursor.getTime() + duration * 60_000 <= windowEnd.getTime()) {
          const slotStart = cursor.getTime();
          const slotEnd = slotStart + duration * 60_000;
          const overlaps = busyRanges.some((b) => slotStart < b.end && slotEnd > b.start);
          const inPast = slotStart <= Date.now();
          if (!overlaps && !inPast) slots.push(new Date(slotStart).toISOString());
          cursor = new Date(cursor.getTime() + slotMin * 60_000);
        }
      }
      if (slots.length) result.push({ staffId, slots });
    }
    return { date: q.date, duration, options: result };
  });

  // Reservar
  app.post('/:slug/book', async (req, reply) => {
    const slug = (req.params as { slug: string }).slug;
    const body = parseOr400(bookSchema, req.body, reply);
    if (!body) return;
    const tenant = await tenantBySlug(slug);
    if (!tenant) return reply.code(404).send({ error: 'Sitio no encontrado' });

    const svc = await query<{ duration_minutes: number }>(
      `SELECT duration_minutes FROM services WHERE id=$1 AND tenant_id=$2 AND is_active=true`,
      [body.serviceId, tenant.id],
    );
    if (!svc.rowCount) return reply.code(404).send({ error: 'Servicio no encontrado' });

    const start = new Date(body.startsAt);
    const end = new Date(start.getTime() + svc.rows[0]!.duration_minutes * 60_000);

    try {
      const result = await withTransaction(async (client) => {
        // branch del staff (si tiene)
        const staff = await client.query<{ branch_id: string | null }>(
          `SELECT branch_id FROM staff_profiles WHERE id=$1 AND tenant_id=$2 AND is_active=true`,
          [body.staffId, tenant.id],
        );
        if (!staff.rowCount) throw new Error('STAFF_NOT_FOUND');

        const ins = await client.query<{ id: string }>(
          `INSERT INTO appointments
             (tenant_id, branch_id, service_id, staff_id, customer_name, customer_phone,
              customer_email, starts_at, ends_at, notes)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
          [
            tenant.id,
            staff.rows[0]!.branch_id,
            body.serviceId,
            body.staffId,
            body.customerName,
            body.customerPhone ?? null,
            body.customerEmail ?? null,
            start.toISOString(),
            end.toISOString(),
            body.notes ?? null,
          ],
        );
        return ins.rows[0]!.id;
      });
      // Correo de confirmación (fire and forget).
      void notifyAppointment(result, 'booked');
      return reply.code(201).send({ id: result, status: 'booked' });
    } catch (err) {
      // El índice único appointments_no_overlap_start rechaza doble reserva.
      if (err instanceof Error && 'code' in err && (err as { code?: string }).code === '23505') {
        return reply.code(409).send({ error: 'Ese horario ya fue tomado' });
      }
      if (err instanceof Error && err.message === 'STAFF_NOT_FOUND') {
        return reply.code(404).send({ error: 'Empleado no encontrado' });
      }
      throw err;
    }
  });
}
