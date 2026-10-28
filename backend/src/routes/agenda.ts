/**
 * Agenda del empleado (rol 'staff'). El empleado ve SOLO sus propias citas
 * y puede cambiar su estado o bloquear sus horas.
 *  - GET  /api/agenda/me?from&to      citas propias en el rango
 *  - POST /api/agenda/appointments/:id/status   marcar atendida/no_show/cancelada
 *  - POST /api/agenda/time-off        bloquear horas propias
 *  - GET  /api/agenda/time-off        listar bloqueos propios
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query } from '../db/pool.ts';
import { parseOr400 } from '../lib/validation.ts';
import { notifyAppointment } from '../lib/notify.ts';

const rangeSchema = z.object({
  from: z.string().datetime(),
  to: z.string().datetime(),
});

const statusSchema = z.object({
  status: z.enum(['confirmed', 'completed', 'no_show', 'cancelled']),
});

const timeOffSchema = z.object({
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  reason: z.string().max(200).optional(),
});

/** Devuelve el staff_profile.id del usuario autenticado, o null si no es staff de un tenant. */
async function staffIdOf(userId: string): Promise<string | null> {
  const { rows } = await query<{ id: string }>(
    'SELECT id FROM staff_profiles WHERE user_id=$1',
    [userId],
  );
  return rows[0]?.id ?? null;
}

export default async function agendaRoutes(app: FastifyInstance): Promise<void> {
  const staff = { preHandler: [app.requireRole('staff')] };

  app.get('/me', staff, async (req, reply) => {
    const q = parseOr400(rangeSchema, req.query, reply);
    if (!q) return;
    const staffId = await staffIdOf(req.user.id);
    if (!staffId) return reply.code(404).send({ error: 'Perfil de empleado no encontrado' });

    const { rows } = await query(
      `SELECT a.id, a.starts_at AS "startsAt", a.ends_at AS "endsAt", a.status,
              a.customer_name AS "customerName", a.customer_phone AS "customerPhone",
              s.name AS "serviceName"
       FROM appointments a JOIN services s ON s.id = a.service_id
       WHERE a.staff_id = $1 AND a.starts_at >= $2 AND a.starts_at < $3
       ORDER BY a.starts_at`,
      [staffId, q.from, q.to],
    );
    return rows;
  });

  app.post('/appointments/:id/status', staff, async (req, reply) => {
    const body = parseOr400(statusSchema, req.body, reply);
    if (!body) return;
    const staffId = await staffIdOf(req.user.id);
    if (!staffId) return reply.code(404).send({ error: 'Perfil de empleado no encontrado' });
    const id = (req.params as { id: string }).id;

    const { rowCount } = await query(
      `UPDATE appointments SET status=$1 WHERE id=$2 AND staff_id=$3`,
      [body.status, id, staffId],
    );
    if (!rowCount) return reply.code(404).send({ error: 'Cita no encontrada' });
    if (body.status === 'cancelled') void notifyAppointment(id, 'cancelled');
    return { ok: true };
  });

  // Horario semanal propio (solo lectura; lo define el owner).
  app.get('/schedule', staff, async (req, reply) => {
    const staffId = await staffIdOf(req.user.id);
    if (!staffId) return reply.code(404).send({ error: 'Perfil de empleado no encontrado' });
    const { rows } = await query(
      `SELECT weekday, to_char(start_time,'HH24:MI') AS "startTime",
              to_char(end_time,'HH24:MI') AS "endTime"
       FROM staff_schedules WHERE staff_id=$1 ORDER BY weekday, start_time`,
      [staffId],
    );
    return rows;
  });

  app.get('/time-off', staff, async (req, reply) => {
    const staffId = await staffIdOf(req.user.id);
    if (!staffId) return reply.code(404).send({ error: 'Perfil de empleado no encontrado' });
    const { rows } = await query(
      `SELECT id, starts_at AS "startsAt", ends_at AS "endsAt", reason
       FROM staff_time_off WHERE staff_id=$1 AND ends_at >= now() ORDER BY starts_at`,
      [staffId],
    );
    return rows;
  });

  app.post('/time-off', staff, async (req, reply) => {
    const body = parseOr400(timeOffSchema, req.body, reply);
    if (!body) return;
    const staffId = await staffIdOf(req.user.id);
    if (!staffId) return reply.code(404).send({ error: 'Perfil de empleado no encontrado' });
    const { rows } = await query(
      `INSERT INTO staff_time_off (staff_id, starts_at, ends_at, reason)
       VALUES ($1,$2,$3,$4) RETURNING id`,
      [staffId, body.startsAt, body.endsAt, body.reason ?? null],
    );
    return reply.code(201).send({ id: rows[0]!.id });
  });
}
