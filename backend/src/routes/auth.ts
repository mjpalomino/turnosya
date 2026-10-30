/**
 * Rutas de autenticación:
 *  - POST /api/auth/login              (todos los roles)
 *  - POST /api/auth/register-business  (alta de un negocio nuevo + trial 2 meses)
 *  - GET  /api/auth/slug-available/:slug
 *  - POST /api/auth/register-customer  (cuenta de cliente global, sirve en todos los negocios)
 *  - GET  /api/auth/me
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query, withTransaction } from '../db/pool.ts';
import { hashPassword, verifyPassword } from '../lib/password.ts';
import { isReservedSlug, parseOr400, slugify } from '../lib/validation.ts';
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
  categoryId: z.string().uuid().optional(),
  city: z.string().trim().max(80).optional(),
});

const customerSchema = z.object({
  fullName: z.string().trim().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(6).max(200),
  phone: z.string().max(30).optional(),
});

type LoginRow = {
  id: string;
  role: AuthUser['role'];
  tenant_id: string | null;
  email: string | null;
  full_name: string;
  password_hash: string | null;
  is_active: boolean;
};

export default async function authRoutes(app: FastifyInstance): Promise<void> {
  // --- Login ---
  app.post('/login', async (req, reply) => {
    const body = parseOr400(loginSchema, req.body, reply);
    if (!body) return;

    // Un mismo correo puede existir como cliente en varios negocios (cuentas anteriores a
    // las cuentas globales). Se prueba cada cuenta y se usa la primera cuya clave coincida.
    const { rows } = await query<LoginRow>(
      `SELECT id, role, tenant_id, email, full_name, password_hash, is_active
       FROM users WHERE lower(email) = lower($1)
       ORDER BY CASE role WHEN 'superadmin' THEN 0 WHEN 'owner' THEN 1 WHEN 'staff' THEN 2 ELSE 3 END,
                (tenant_id IS NULL) DESC, created_at
       LIMIT 10`,
      [body.email],
    );
    let user: LoginRow | undefined;
    for (const candidate of rows) {
      if (!candidate.password_hash || !candidate.is_active) continue;
      if (await verifyPassword(body.password, candidate.password_hash)) {
        user = candidate;
        break;
      }
    }
    if (!user) return reply.code(401).send({ error: 'Credenciales inválidas' });

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
    if (slug.length < 3 || isReservedSlug(slug)) return reply.send({ slug, available: false });
    const { rowCount } = await query('SELECT 1 FROM tenants WHERE slug = $1', [slug]);
    return reply.send({ slug, available: rowCount === 0 });
  });

  // --- Alta de negocio con trial de 2 meses ---
  app.post('/register-business', async (req, reply) => {
    const body = parseOr400(registerSchema, req.body, reply);
    if (!body) return;

    // slug único
    let base = slugify(body.businessName) || 'negocio';
    if (base.length < 3 || isReservedSlug(base)) base = `${base}-negocio`.replace(/^-+/, '');
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
        `INSERT INTO tenants (slug, name, category_id, city)
         VALUES ($1, $2, (SELECT id FROM business_categories WHERE id = $3), $4) RETURNING id`,
        [slug, body.businessName, body.categoryId ?? null, body.city || null],
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

  // --- Alta de cliente final (cuenta global para todos los negocios) ---
  app.post('/register-customer', async (req, reply) => {
    const body = parseOr400(customerSchema, req.body, reply);
    if (!body) return;
    const created = await createGlobalCustomer(body);
    if ('error' in created) return reply.code(409).send({ error: created.error });
    return reply.code(201).send({ token: app.jwt.sign(created.user), user: created.user });
  });

  // --- Usuario actual ---
  app.get('/me', { preHandler: [app.authenticate] }, async (req) => {
    return { user: req.user };
  });
}

/**
 * Crea una cuenta de cliente global (tenant_id NULL). Si se indica un negocio,
 * lo deja asociado para que aparezca en sus clientes.
 */
export async function createGlobalCustomer(
  body: { fullName: string; email: string; password: string; phone?: string },
  tenantId?: string,
): Promise<{ user: AuthUser } | { error: string }> {
  const dup = await query<{ role: string }>(
    'SELECT role FROM users WHERE lower(email) = lower($1) LIMIT 1',
    [body.email],
  );
  if (dup.rowCount) {
    return {
      error: dup.rows[0]!.role === 'customer'
        ? 'Ya tienes una cuenta con ese correo. Inicia sesión.'
        : 'Ese correo ya está en uso por otra cuenta',
    };
  }
  const hash = await hashPassword(body.password);
  const user = await withTransaction(async (client) => {
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO users (tenant_id, role, email, phone, full_name, password_hash)
       VALUES (NULL, 'customer', $1, $2, $3, $4) RETURNING id`,
      [body.email, body.phone ?? null, body.fullName, hash],
    );
    const id = rows[0]!.id;
    if (tenantId) {
      await client.query(
        `INSERT INTO customer_businesses (customer_id, tenant_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [id, tenantId],
      );
    }
    return id;
  });
  return {
    user: { id: user, role: 'customer', tenantId: null, email: body.email, fullName: body.fullName },
  };
}
