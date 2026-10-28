/**
 * Empleados (staff). El owner los crea y gestiona. Cada staff tiene un usuario
 * con rol 'staff', horario semanal y servicios que presta.
 *  - GET    /api/staff                 (owner)
 *  - POST   /api/staff                 (owner) crea usuario staff + perfil
 *  - PUT    /api/staff/:id             (owner)
 *  - PUT    /api/staff/:id/schedule    (owner) reemplaza el horario semanal
 *  - PUT    /api/staff/:id/services    (owner) asigna servicios
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query, withTransaction } from '../db/pool.ts';
import { hashPassword } from '../lib/password.ts';
import { parseOr400 } from '../lib/validation.ts';

const createSchema = z.object({
  fullName: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(6).max(200),
  title: z.string().max(100).optional(),
  branchId: z.string().uuid().optional(),
});

const scheduleSchema = z.object({
  slots: z
    .array(
      z.object({
        weekday: z.number().int().min(0).max(6),
        startTime: z.string().regex(/^\d{2}:\d{2}$/),
        endTime: z.string().regex(/^\d{2}:\d{2}$/),
      }),
    )
    .max(50),
});

const servicesSchema = z.object({ serviceIds: z.array(z.string().uuid()).max(100) });

export default async function staffRoutes(app: FastifyInstance): Promise<void> {
  const owner = { preHandler: [app.requireRole('owner')] };

  app.get('/', owner, async (req) => {
    const { rows } = await query(
      `SELECT sp.id, sp.title, sp.branch_id AS "branchId", sp.is_active AS "isActive",
              u.full_name AS "fullName", u.email
       FROM staff_profiles sp JOIN users u ON u.id = sp.user_id
       WHERE sp.tenant_id = $1 ORDER BY u.full_name`,
      [req.user.tenantId],
    );
    return rows;
  });

  app.post('/', owner, async (req, reply) => {
    const body = parseOr400(createSchema, req.body, reply);
    if (!body) return;

    const dup = await query('SELECT 1 FROM users WHERE lower(email)=lower($1)', [body.email]);
    if (dup.rowCount) return reply.code(409).send({ error: 'Ese correo ya existe' });

    const hash = await hashPassword(body.password);
    const result = await withTransaction(async (client) => {
      const user = await client.query<{ id: string }>(
        `INSERT INTO users (tenant_id, role, email, full_name, password_hash)
         VALUES ($1,'staff',$2,$3,$4) RETURNING id`,
        [req.user.tenantId, body.email, body.fullName, hash],
      );
      const staff = await client.query<{ id: string }>(
        `INSERT INTO staff_profiles (tenant_id, user_id, branch_id, title)
         VALUES ($1,$2,$3,$4) RETURNING id`,
        [req.user.tenantId, user.rows[0]!.id, body.branchId ?? null, body.title ?? null],
      );
      return staff.rows[0]!.id;
    });
    return reply.code(201).send({ id: result });
  });

  app.put('/:id/schedule', owner, async (req, reply) => {
    const body = parseOr400(scheduleSchema, req.body, reply);
    if (!body) return;
    const staffId = (req.params as { id: string }).id;

    // valida pertenencia al tenant
    const own = await query('SELECT 1 FROM staff_profiles WHERE id=$1 AND tenant_id=$2', [
      staffId,
      req.user.tenantId,
    ]);
    if (!own.rowCount) return reply.code(404).send({ error: 'No encontrado' });

    await withTransaction(async (client) => {
      await client.query('DELETE FROM staff_schedules WHERE staff_id=$1', [staffId]);
      for (const s of body.slots) {
        await client.query(
          `INSERT INTO staff_schedules (staff_id, weekday, start_time, end_time)
           VALUES ($1,$2,$3,$4)`,
          [staffId, s.weekday, s.startTime, s.endTime],
        );
      }
    });
    return { ok: true };
  });

  app.put('/:id/services', owner, async (req, reply) => {
    const body = parseOr400(servicesSchema, req.body, reply);
    if (!body) return;
    const staffId = (req.params as { id: string }).id;
    const own = await query('SELECT 1 FROM staff_profiles WHERE id=$1 AND tenant_id=$2', [
      staffId,
      req.user.tenantId,
    ]);
    if (!own.rowCount) return reply.code(404).send({ error: 'No encontrado' });

    await withTransaction(async (client) => {
      await client.query('DELETE FROM staff_services WHERE staff_id=$1', [staffId]);
      for (const sid of body.serviceIds) {
        await client.query(
          `INSERT INTO staff_services (staff_id, service_id)
           SELECT $1, id FROM services WHERE id=$2 AND tenant_id=$3`,
          [staffId, sid, req.user.tenantId],
        );
      }
    });
    return { ok: true };
  });
}
