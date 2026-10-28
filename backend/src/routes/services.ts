/**
 * Servicios del negocio. Solo el owner gestiona; público puede listar los activos.
 *  - GET    /api/services            (owner: todos)
 *  - POST   /api/services            (owner)
 *  - PUT    /api/services/:id        (owner)
 *  - DELETE /api/services/:id        (owner, soft: is_active=false)
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query } from '../db/pool.ts';
import { parseOr400 } from '../lib/validation.ts';

const serviceSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  durationMinutes: z.number().int().positive().max(1440),
  priceCop: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
});

export default async function serviceRoutes(app: FastifyInstance): Promise<void> {
  const owner = { preHandler: [app.requireRole('owner')] };

  app.get('/', owner, async (req) => {
    const tenantId = req.user.tenantId;
    const { rows } = await query(
      `SELECT id, name, description, duration_minutes AS "durationMinutes",
              price_cop AS "priceCop", is_active AS "isActive"
       FROM services WHERE tenant_id = $1 ORDER BY name`,
      [tenantId],
    );
    return rows;
  });

  app.post('/', owner, async (req, reply) => {
    const body = parseOr400(serviceSchema, req.body, reply);
    if (!body) return;
    const { rows } = await query(
      `INSERT INTO services (tenant_id, name, description, duration_minutes, price_cop, is_active)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [req.user.tenantId, body.name, body.description ?? null, body.durationMinutes, body.priceCop, body.isActive],
    );
    return reply.code(201).send({ id: rows[0]!.id });
  });

  app.put('/:id', owner, async (req, reply) => {
    const body = parseOr400(serviceSchema, req.body, reply);
    if (!body) return;
    const id = (req.params as { id: string }).id;
    const { rowCount } = await query(
      `UPDATE services SET name=$1, description=$2, duration_minutes=$3, price_cop=$4, is_active=$5
       WHERE id=$6 AND tenant_id=$7`,
      [body.name, body.description ?? null, body.durationMinutes, body.priceCop, body.isActive, id, req.user.tenantId],
    );
    if (!rowCount) return reply.code(404).send({ error: 'No encontrado' });
    return { ok: true };
  });

  app.delete('/:id', owner, async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const { rowCount } = await query(
      `UPDATE services SET is_active=false WHERE id=$1 AND tenant_id=$2`,
      [id, req.user.tenantId],
    );
    if (!rowCount) return reply.code(404).send({ error: 'No encontrado' });
    return { ok: true };
  });
}
