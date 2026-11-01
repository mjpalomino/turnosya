/**
 * Empleados (staff). El owner los crea y gestiona. Cada staff tiene un usuario
 * con rol 'staff', horario semanal y servicios que presta.
 *  - GET    /api/staff                 (owner)
 *  - POST   /api/staff                 (owner) crea usuario staff + perfil
 *  - PUT    /api/staff/:id             (owner) nombre, cargo, foto, sede y estado
 *  - PUT    /api/staff/:id/schedule    (owner) reemplaza el horario semanal
 *  - PUT    /api/staff/:id/services    (owner) asigna servicios
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query, withTransaction } from '../db/pool.ts';
import { hashPassword } from '../lib/password.ts';
import { imageUrlSchema, parseOr400 } from '../lib/validation.ts';
import { getEntitlements } from '../lib/plan-features.ts';

const createSchema = z.object({
  fullName: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(6).max(200),
  title: z.string().max(100).optional(),
  branchId: z.string().uuid().optional(),
});

const updateSchema = z.object({
  fullName: z.string().trim().min(2).max(100),
  title: z.preprocess((v) => (typeof v === 'string' && !v.trim() ? null : v), z.string().trim().max(100).nullable().optional()),
  photoUrl: z.preprocess((v) => (typeof v === 'string' && !v.trim() ? null : v), imageUrlSchema.nullable().optional()),
  branchId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().default(true),
});

/** Verifica el límite de empleados activos del plan. Devuelve el mensaje de error o null. */
async function staffLimitError(tenantId: string, extra = 1): Promise<string | null> {
  const ent = await getEntitlements(tenantId);
  const max = ent.limits.maxStaff;
  if (max === null) return null;
  const { rows } = await query<{ n: number }>(
    'SELECT count(*)::int AS n FROM staff_profiles WHERE tenant_id=$1 AND is_active', [tenantId]);
  if ((rows[0]?.n ?? 0) + extra > max) {
    return `Tu plan ${ent.planName ?? ''} permite hasta ${max} empleados activos. Cambia de plan para agregar más.`.replace('  ', ' ');
  }
  return null;
}

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
              sp.photo_url AS "photoUrl", u.full_name AS "fullName", u.email
       FROM staff_profiles sp JOIN users u ON u.id = sp.user_id
       WHERE sp.tenant_id = $1 ORDER BY u.full_name`,
      [req.user.tenantId],
    );
    return rows;
  });

  app.post('/', owner, async (req, reply) => {
    const body = parseOr400(createSchema, req.body, reply);
    if (!body) return;

    const limit = await staffLimitError(req.user.tenantId!);
    if (limit) return reply.code(403).send({ error: limit, code: 'PLAN_LIMIT' });

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

  app.put('/:id', owner, async (req, reply) => {
    const body = parseOr400(updateSchema, req.body, reply);
    if (!body) return;
    const staffId = (req.params as { id: string }).id;
    if (!z.string().uuid().safeParse(staffId).success) return reply.code(404).send({ error: 'No encontrado' });
    const cur = await query<{ user_id: string; is_active: boolean }>(
      'SELECT user_id, is_active FROM staff_profiles WHERE id=$1 AND tenant_id=$2', [staffId, req.user.tenantId]);
    const row = cur.rows[0];
    if (!row) return reply.code(404).send({ error: 'No encontrado' });
    if (body.isActive && !row.is_active) {
      const limit = await staffLimitError(req.user.tenantId!);
      if (limit) return reply.code(403).send({ error: limit, code: 'PLAN_LIMIT' });
    }
    await withTransaction(async (client) => {
      await client.query(
        `UPDATE staff_profiles SET title=$1, photo_url=$2,
                branch_id=(SELECT id FROM branches WHERE id=$3 AND tenant_id=$5), is_active=$4
          WHERE id=$6`,
        [body.title ?? null, body.photoUrl ?? null, body.branchId ?? null, body.isActive, req.user.tenantId, staffId],
      );
      await client.query('UPDATE users SET full_name=$1, is_active=$2 WHERE id=$3', [body.fullName, body.isActive, row.user_id]);
    });
    return { ok: true };
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
