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
