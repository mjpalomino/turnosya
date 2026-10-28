/**
 * Rutas de autenticación:
 *  - POST /api/auth/login              (todos los roles)
 *  - POST /api/auth/register-business  (alta de un negocio nuevo + trial 2 meses)
 *  - GET  /api/auth/slug-available/:slug
 *  - GET  /api/auth/me
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query, withTransaction } from '../db/pool.ts';
import { hashPassword, verifyPassword } from '../lib/password.ts';
import { parseOr400, slugify } from '../lib/validation.ts';
import type { AuthUser } from '../types/auth.ts';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const registerSchema = z.object({
  businessName: z.string().min(2).max(100),
  ownerName: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(6).max(200),
  phone: z.string().max(30).optional(),
});

export default async function authRoutes(app: FastifyInstance): Promise<void> {
  // --- Login ---
  app.post('/login', async (req, reply) => {
    const body = parseOr400(loginSchema, req.body, reply);
    if (!body) return;

    const { rows } = await query<{
      id: string;
      role: AuthUser['role'];
      tenant_id: string | null;
      email: string | null;
      full_name: string;
      password_hash: string | null;
      is_active: boolean;
    }>(
      `SELECT id, role, tenant_id, email, full_name, password_hash, is_active
       FROM users WHERE lower(email) = lower($1) LIMIT 1`,
      [body.email],
    );
    const user = rows[0];
    if (!user || !user.password_hash || !user.is_active) {
      return reply.code(401).send({ error: 'Credenciales inválidas' });
    }
    const ok = await verifyPassword(body.password, user.password_hash);
    if (!ok) return reply.code(401).send({ error: 'Credenciales inválidas' });

    const payload: AuthUser = {
      id: user.id,
      role: user.role,
      tenantId: user.tenant_id,
      email: user.email,
      fullName: user.full_name,
    };
    const token = app.jwt.sign(payload);
    return reply.send({ token, user: payload });
  });

  // --- Disponibilidad de slug ---
  app.get('/slug-available/:slug', async (req, reply) => {
    const slug = slugify((req.params as { slug: string }).slug);
    const { rowCount } = await query('SELECT 1 FROM tenants WHERE slug = $1', [slug]);
    return reply.send({ slug, available: rowCount === 0 });
  });

  // --- Alta de negocio con trial de 2 meses ---
  app.post('/register-business', async (req, reply) => {
    const body = parseOr400(registerSchema, req.body, reply);
    if (!body) return;

    // slug único
    let base = slugify(body.businessName) || 'negocio';
    let slug = base;
    for (let i = 2; ; i++) {
      const { rowCount } = await query('SELECT 1 FROM tenants WHERE slug = $1', [slug]);
      if (rowCount === 0) break;
      slug = `${base}-${i}`;
    }

    // email no repetido globalmente para owners
    const dup = await query('SELECT 1 FROM users WHERE lower(email) = lower($1)', [body.email]);
    if (dup.rowCount) return reply.code(409).send({ error: 'Ese correo ya está registrado' });

    const hash = await hashPassword(body.password);

    const result = await withTransaction(async (client) => {
      const tenant = await client.query<{ id: string }>(
        `INSERT INTO tenants (slug, name) VALUES ($1, $2) RETURNING id`,
        [slug, body.businessName],
      );
      const tenantId = tenant.rows[0]!.id;

      await client.query(`INSERT INTO tenant_branding (tenant_id, phone) VALUES ($1, $2)`, [
        tenantId,
        body.phone ?? null,
      ]);
      await client.query(`INSERT INTO tenant_settings (tenant_id) VALUES ($1)`, [tenantId]);
      await client.query(`INSERT INTO loyalty_settings (tenant_id) VALUES ($1)`, [tenantId]);

      // Trial de 2 meses
      await client.query(
        `INSERT INTO subscriptions (tenant_id, status, trial_ends_at, current_period_end)
         VALUES ($1, 'trial', now() + interval '2 months', now() + interval '2 months')`,
        [tenantId],
      );

      // Sede inicial
      const branch = await client.query<{ id: string }>(
        `INSERT INTO branches (tenant_id, name, phone) VALUES ($1, 'Sede principal', $2) RETURNING id`,
        [tenantId, body.phone ?? null],
      );

      // Usuario owner
      const owner = await client.query<{ id: string }>(
        `INSERT INTO users (tenant_id, role, email, phone, full_name, password_hash)
         VALUES ($1, 'owner', $2, $3, $4, $5) RETURNING id`,
        [tenantId, body.email, body.phone ?? null, body.ownerName, hash],
      );

      return { tenantId, slug, ownerId: owner.rows[0]!.id, branchId: branch.rows[0]!.id };
    });

    const payload: AuthUser = {
      id: result.ownerId,
      role: 'owner',
      tenantId: result.tenantId,
      email: body.email,
      fullName: body.ownerName,
    };
    const token = app.jwt.sign(payload);
    return reply.code(201).send({ token, user: payload, slug: result.slug });
  });

  // --- Usuario actual ---
  app.get('/me', { preHandler: [app.authenticate] }, async (req) => {
    return { user: req.user };
  });
}
