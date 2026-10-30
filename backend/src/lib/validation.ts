/** Helper para validar el body/params/query con Zod y responder 400 uniforme. */
import type { FastifyReply } from 'fastify';
import { z } from 'zod';

export function parseOr400<T>(
  schema: z.ZodType<T>,
  data: unknown,
  reply: FastifyReply,
): T | undefined {
  const result = schema.safeParse(data);
  if (!result.success) {
    reply.code(400).send({ error: 'Datos inválidos', details: z.treeifyError(result.error) });
    return undefined;
  }
  return result.data;
}

/** Slug a partir de un nombre: minúsculas, sin acentos, guiones. */
export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/**
 * Rutas del frontend que no pueden usarse como link de un negocio, porque
 * el link corto es turnosya.com/<slug>.
 */
export const RESERVED_SLUGS = new Set([
  'login', 'registro', 'registro-negocio', 'registro-cliente', 'sitio', 'panel', 'admin',
  'mis-citas', 'mi-agenda', 'fidelizacion', 'api', 'negocios', 'explorar', 'buscar',
  'assets', 'icons', 'media', 'ngsw', 'ngsw-worker', 'manifest', 'favicon', 'index',
  'app', 'www', 'turnosya', 'soporte', 'ayuda', 'terminos', 'privacidad', 'n',
]);

/** Slug válido: 3-50 caracteres, minúsculas, números y guiones (sin guion al inicio/fin). */
export const slugSchema = z
  .string()
  .regex(/^[a-z0-9](?:[a-z0-9-]{1,48})[a-z0-9]$/, 'Usa de 3 a 50 letras minúsculas, números o guiones')
  .refine((s) => !s.includes('--'), 'No uses dos guiones seguidos')
  .refine((s) => !RESERVED_SLUGS.has(s), 'Ese link está reservado por la plataforma');

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug);
}

/**
 * URL de imagen aceptada: una imagen cargada en la plataforma (/api/media/<uuid>)
 * o una URL http(s) externa.
 */
export const imageUrlSchema = z
  .string()
  .max(500)
  .refine(
    (v) => /^\/api\/media\/[0-9a-f-]{36}$/i.test(v) || /^https?:\/\/[^\s]+$/i.test(v),
    'URL de imagen inválida',
  );

export const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);
