/**
 * Datos públicos de la plataforma (sin login).
 *  - GET /api/platform/branding   nombre, logo y colores definidos por el superadmin
 *  - GET /api/platform/contact    datos de contacto del sitio principal
 */
import type { FastifyInstance } from 'fastify';
import { query } from '../db/pool.ts';

export default async function platformRoutes(app: FastifyInstance): Promise<void> {
  app.get('/branding', async (_req, reply) => {
    const { rows } = await query(
      `SELECT brand_name AS "brandName", logo_url AS "logoUrl", primary_color AS "primaryColor",
              secondary_color AS "secondaryColor", tagline
         FROM platform_branding WHERE id=1`,
    );
    // Caché corta: los cambios del superadmin se ven en un minuto.
    reply.header('Cache-Control', 'public, max-age=60');
    return rows[0] ?? { brandName: 'TurnosYa', logoUrl: null, primaryColor: '#3458E8', secondaryColor: '#203CB3', tagline: null };
  });

  // Datos de contacto del sitio principal (definidos por el superadmin).
  app.get('/contact', async (_req, reply) => {
    let row: Record<string, unknown> | undefined;
    try {
      const { rows } = await query(
        `SELECT contact_email AS "email", contact_phone AS "phone", contact_whatsapp AS "whatsapp",
                contact_address AS "address", contact_city AS "city", support_hours AS "supportHours",
                instagram, facebook, tiktok, website
           FROM platform_settings WHERE id=1`,
      );
      row = rows[0];
    } catch { row = undefined; }
    reply.header('Cache-Control', 'public, max-age=60');
    return row ?? {};
  });
}
