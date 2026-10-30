/**
 * Rutas públicas del sitio de cada negocio (sin login).
 *  - GET  /api/public/:slug                 branding + servicios activos
 *  - GET  /api/public/:slug/availability     huecos libres de un servicio en un día
 *  - POST /api/public/:slug/book             reservar una cita (requiere cuenta de cliente)
 *
 * La disponibilidad se calcula con el horario del empleado, menos sus bloqueos
 * y menos las citas ya tomadas, en pasos de `slot_minutes`.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query, withTransaction } from '../db/pool.ts';
import { parseOr400 } from '../lib/validation.ts';
import { notifyAppointment } from '../lib/notify.ts';
import { zonedToUtc } from '../lib/time.ts';

const availabilitySchema = z.object({
  serviceId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  staffId: z.string().uuid().optional(),
});

const bookSchema = z.object({
  serviceId: z.string().uuid(),
  staffId: z.string().uuid(),
  startsAt: z.string().datetime(),
  customerPhone: z.string().max(30).optional(),
  notes: z.string().max(500).optional(),
});

/** Carga el tenant activo por slug o responde 404. */
async function tenantBySlug(slug: string): Promise<{ id: string; timezone: string } | null> {
  const { rows } = await query<{ id: string; timezone: string }>(
    `SELECT id, timezone FROM tenants WHERE slug=$1 AND status='active'`,
    [slug.toLowerCase()],
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
      `SELECT logo_url AS "logoUrl", cover_url AS "coverUrl", primary_color AS "primaryColor",
              secondary_color AS "secondaryColor", phone, whatsapp_number AS "whatsappNumber",
              email, address, about, instagram, website
       FROM tenant_branding WHERE tenant_id=$1`,
      [tenant.id],
    );
    const services = await query(
      `SELECT id, name, description, duration_minutes AS "durationMinutes", price_cop AS "priceCop"
       FROM services WHERE tenant_id=$1 AND is_active=true ORDER BY name`,
      [tenant.id],
    );
    const profile = await query<{
      name: string; city: string | null; tagline: string | null;
      latitude: number | null; longitude: number | null;
      category_name: string | null; category_slug: string | null; category_icon: string | null;
      rating: number | null; reviews: number;
    }>(
      `SELECT t.name, t.city, t.tagline, t.latitude, t.longitude,
              c.name AS category_name, c.slug AS category_slug, c.icon AS category_icon,
              (SELECT round(avg(r.rating)::numeric, 1) FROM reviews r WHERE r.tenant_id=t.id)::float AS rating,
              (SELECT count(*) FROM reviews r WHERE r.tenant_id=t.id)::int AS reviews
         FROM tenants t LEFT JOIN business_categories c ON c.id=t.category_id
        WHERE t.id=$1`,
      [tenant.id],
    );
    // Nombre visible de quienes atienden (para elegir profesional).
    const staff = await query(
      `SELECT sp.id, u.full_name AS "fullName", sp.title
         FROM staff_profiles sp JOIN users u ON u.id = sp.user_id
        WHERE sp.tenant_id=$1 AND sp.is_active=true ORDER BY u.full_name`,
      [tenant.id],
    );
    const p = profile.rows[0]!;
    return {
      name: p.name,
      timezone: tenant.timezone,
      city: p.city,
      tagline: p.tagline,
      location: p.latitude !== null && p.longitude !== null ? { lat: p.latitude, lng: p.longitude } : null,
      category: p.category_slug ? { slug: p.category_slug, name: p.category_name, icon: p.category_icon } : null,
      rating: p.rating,
      reviews: p.reviews,
      branding: branding.rows[0] ?? null,
      services: services.rows,
      staff: staff.rows,
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
    // Corrección: antes, sin staffId el parámetro $1 quedaba sin uso y Postgres
    // respondía "could not determine data type of parameter $1" (error 500).
    const staffRows = await query<{ id: string }>(
      `SELECT sp.id FROM staff_profiles sp
         JOIN staff_services ss ON ss.staff_id=sp.id
        WHERE ($1::uuid IS NULL OR sp.id=$1::uuid)
          AND sp.tenant_id=$2 AND sp.is_active=true AND ss.service_id=$3`,
      [q.staffId ?? null, tenant.id, q.serviceId],
    );

    const result: Array<{ staffId: string; slots: string[] }> = [];
    for (const { id: staffId } of staffRows.rows) {
      // ventanas de trabajo ese día
      const sched = await query<{ start_time: string; end_time: string }>(
        `SELECT start_time, end_time FROM staff_schedules WHERE staff_id=$1 AND weekday=$2`,
        [staffId, weekday],
      );
      if (!sched.rowCount) continue;

      // citas y bloqueos que se cruzan con ese día (en la zona horaria del negocio)
      const dayStart = zonedToUtc(q.date, '00:00', tenant.timezone);
      const dayEnd = new Date(dayStart.getTime() + 24 * 3_600_000);
      const busy = await query<{ starts_at: string; ends_at: string }>(
        `SELECT starts_at, ends_at FROM appointments
          WHERE staff_id=$1 AND status IN ('booked','confirmed')
            AND starts_at < $3 AND ends_at > $2
         UNION ALL
         SELECT starts_at, ends_at FROM staff_time_off
          WHERE staff_id=$1 AND starts_at < $3 AND ends_at > $2`,
        [staffId, dayStart.toISOString(), dayEnd.toISOString()],
      );
      const busyRanges = busy.rows.map((b) => ({
        start: new Date(b.starts_at).getTime(),
        end: new Date(b.ends_at).getTime(),
      }));

      const slots: string[] = [];
      for (const w of sched.rows) {
        // El horario del empleado está en hora local del negocio.
        let cursor = zonedToUtc(q.date, w.start_time, tenant.timezone);
        const windowEnd = zonedToUtc(q.date, w.end_time, tenant.timezone);
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
  app.post('/:slug/book', { preHandler: [app.requireRole('customer')] }, async (req, reply) => {
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
    if (start.getTime() <= Date.now()) return reply.code(400).send({ error: 'Elige un horario futuro' });

    // Datos del cliente desde su cuenta (no se confía en lo que envía el navegador).
    const me = await query<{ full_name: string; email: string | null; phone: string | null }>(
      `SELECT full_name, email, phone FROM users WHERE id=$1 AND role='customer' AND is_active=true`,
      [req.user.id],
    );
    if (!me.rowCount) return reply.code(401).send({ error: 'Inicia sesión de nuevo' });
    const customer = me.rows[0]!;
    const phone = body.customerPhone?.trim() || customer.phone;

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
             (tenant_id, branch_id, service_id, staff_id, customer_id, customer_name, customer_phone,
              customer_email, starts_at, ends_at, notes)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
          [
            tenant.id,
            staff.rows[0]!.branch_id,
            body.serviceId,
            body.staffId,
            req.user.id,
            customer.full_name,
            phone ?? null,
            customer.email,
            start.toISOString(),
            end.toISOString(),
            body.notes ?? null,
          ],
        );
        // Asocia el cliente al negocio (aparece en "Clientes" del dueño).
        await client.query(
          `INSERT INTO customer_businesses (customer_id, tenant_id) VALUES ($1,$2)
           ON CONFLICT (customer_id, tenant_id) DO UPDATE SET last_seen_at = now()`,
          [req.user.id, tenant.id],
        );
        if (phone && !customer.phone) {
          await client.query('UPDATE users SET phone=$1 WHERE id=$2', [phone, req.user.id]);
        }
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
