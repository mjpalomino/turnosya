/**
 * Carga y entrega de imágenes (logo y portada del negocio, logo de la plataforma).
 *  - POST /api/media/upload   (owner | superadmin) recibe { kind, dataUrl } en base64
 *  - GET  /api/media/:id      (público) entrega la imagen con caché larga
 *
 * Seguridad:
 *  - Solo PNG, JPEG o WebP (no SVG: podría contener scripts).
 *  - Se valida la firma binaria (magic bytes), no solo el tipo declarado.
 *  - Máximo 2 MB por imagen. El front ya las reduce antes de subirlas.
 *  - El owner solo sube imágenes de su propio negocio; el superadmin, el logo de la plataforma.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query } from '../db/pool.ts';
import { parseOr400 } from '../lib/validation.ts';
import { decodeImageDataUrl, MAX_IMAGE_BYTES } from '../lib/image.ts';

const uploadSchema = z.object({
  kind: z.enum(['logo', 'cover', 'platform_logo']),
  dataUrl: z.string().min(30).max(3_000_000),
});

export default async function mediaRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/upload',
    { preHandler: [app.requireRole('owner', 'superadmin')], bodyLimit: 4 * 1024 * 1024 },
    async (req, reply) => {
      const body = parseOr400(uploadSchema, req.body, reply);
      if (!body) return;

      const isPlatform = body.kind === 'platform_logo';
      if (isPlatform && req.user.role !== 'superadmin') {
        return reply.code(403).send({ error: 'No autorizado' });
      }
      if (!isPlatform && req.user.role !== 'owner') {
        return reply.code(403).send({ error: 'Solo el dueño del negocio puede subir esta imagen' });
      }

      const img = decodeImageDataUrl(body.dataUrl);
      if (!img) return reply.code(400).send({ error: 'Formato no válido. Usa PNG, JPG o WebP.' });
      if (img.data.length > MAX_IMAGE_BYTES) {
        return reply.code(413).send({ error: 'La imagen supera 2 MB' });
      }

      const tenantId = isPlatform ? null : req.user.tenantId;
      const { rows } = await query<{ id: string }>(
        `INSERT INTO media_assets (tenant_id, uploaded_by, kind, mime, size_bytes, data)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [tenantId, req.user.id, body.kind, img.mime, img.data.length, img.data],
      );
      const id = rows[0]!.id;

      // Limpieza: borra cargas anteriores del mismo tipo que ya no están en uso.
      await query(
        `DELETE FROM media_assets m
          WHERE m.kind = $1 AND m.tenant_id IS NOT DISTINCT FROM $2 AND m.id <> $3
            AND m.created_at < now() - interval '1 hour'
            AND NOT EXISTS (SELECT 1 FROM tenant_branding b
                             WHERE b.logo_url = '/api/media/' || m.id OR b.cover_url = '/api/media/' || m.id)
            AND NOT EXISTS (SELECT 1 FROM platform_branding p WHERE p.logo_url = '/api/media/' || m.id)`,
        [body.kind, tenantId, id],
      );

      return reply.code(201).send({ id, url: `/api/media/${id}` });
    },
  );

  app.get('/:id', async (req, reply) => {
    const id = (req.params as { id: string }).id;
    if (!z.string().uuid().safeParse(id).success) return reply.code(404).send({ error: 'No encontrado' });
    const { rows } = await query<{ mime: string; data: Buffer }>(
      'SELECT mime, data FROM media_assets WHERE id=$1',
      [id],
    );
    const row = rows[0];
    if (!row) return reply.code(404).send({ error: 'No encontrado' });
    return reply
      .header('Content-Type', row.mime)
      .header('Cache-Control', 'public, max-age=31536000, immutable')
      .header('X-Content-Type-Options', 'nosniff')
      .header('Content-Security-Policy', "default-src 'none'")
      .send(row.data);
  });
}
