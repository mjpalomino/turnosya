/**
 * Punto de entrada del API TurnosYa.
 * Registra plugins (seguridad, CORS, JWT) y todas las rutas bajo /api.
 */
import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import { config } from './config.ts';
import authPlugin from './plugins/auth.ts';
import { pool } from './db/pool.ts';

import authRoutes from './routes/auth.ts';
import serviceRoutes from './routes/services.ts';
import staffRoutes from './routes/staff.ts';
import agendaRoutes from './routes/agenda.ts';
import publicRoutes from './routes/public.ts';
import loyaltyRoutes from './routes/loyalty.ts';
import superadminRoutes from './routes/superadmin.ts';
import tenantRoutes from './routes/tenant.ts';
import customerRoutes from './routes/customer.ts';
import billingRoutes from './routes/billing.ts';
import directoryRoutes from './routes/directory.ts';
import mediaRoutes from './routes/media.ts';
import platformRoutes from './routes/platform.ts';

export async function buildServer() {
  const app = Fastify({
    logger: {
      level: config.NODE_ENV === 'production' ? 'info' : 'debug',
    },
    trustProxy: true, // detrás de nginx/Coolify
  });

  // Seguridad base
  await app.register(cors, {
    origin: config.NODE_ENV === 'production' ? config.APP_URL : true,
    credentials: true,
  });
  await app.register(cookie);
  await app.register(rateLimit, {
    max: 300,
    timeWindow: '1 minute',
  });
  await app.register(authPlugin);

  // Planes activos (público; usado por la pantalla de suscripción del dueño).
  app.get('/api/plans', async () => {
    const { rows } = await pool.query(
      `SELECT id, name, price_cop AS "priceCop", max_staff AS "maxStaff",
              max_branches AS "maxBranches", max_services AS "maxServices",
              features, is_active AS "isActive", sort_order AS "sortOrder"
       FROM plans WHERE is_active = true ORDER BY sort_order, name`,
    );
    return rows;
  });

  // Health check para Coolify
  app.get('/api/health', async () => {
    await pool.query('SELECT 1');
    return { status: 'ok', ts: new Date().toISOString() };
  });

  // Rutas de negocio
  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(publicRoutes, { prefix: '/api/public' });
  await app.register(directoryRoutes, { prefix: '/api/directory' });
  await app.register(platformRoutes, { prefix: '/api/platform' });
  await app.register(mediaRoutes, { prefix: '/api/media' });
  await app.register(customerRoutes, { prefix: '/api/customer' });
  await app.register(serviceRoutes, { prefix: '/api/services' });
  await app.register(staffRoutes, { prefix: '/api/staff' });
  await app.register(agendaRoutes, { prefix: '/api/agenda' });
  await app.register(loyaltyRoutes, { prefix: '/api/loyalty' });
  await app.register(tenantRoutes, { prefix: '/api/tenant' });
  await app.register(billingRoutes, { prefix: '/api/billing' });
  await app.register(superadminRoutes, { prefix: '/api/admin' });

  return app;
}

// Arranque directo
if (import.meta.url === `file://${process.argv[1]}`) {
  const app = await buildServer();
  try {
    await app.listen({ port: config.PORT, host: config.HOST });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}
