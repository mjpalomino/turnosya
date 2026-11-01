/**
 * Pagos con Nequi (manuales): validación de la cuenta y guardado de comprobantes.
 *
 * Nequi no notifica los pagos a terceros, así que el flujo es:
 *   quien paga escanea el QR o transfiere al número → sube el comprobante →
 *   el superadmin (suscripciones) o el dueño (citas) revisa y aprueba o rechaza.
 */
import { z } from 'zod';
import { decodeImageDataUrl, MAX_IMAGE_BYTES } from './image.ts';
import { imageUrlSchema } from './validation.ts';

/** Celular colombiano: 10 dígitos que empiezan por 3 (se aceptan espacios, guiones y +57). */
export function normalizeNequiNumber(raw: string): string | null {
  let d = raw.replace(/[^\d]/g, '');
  if (d.length === 12 && d.startsWith('57')) d = d.slice(2);
  return /^3\d{9}$/.test(d) ? d : null;
}

const emptyToNull = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v);

export const nequiSettingsSchema = z.object({
  enabled: z.boolean(),
  number: z.preprocess(emptyToNull, z.string().max(20).nullable().optional()),
  holder: z.preprocess(emptyToNull, z.string().trim().max(80).nullable().optional()),
  qrUrl: z.preprocess(emptyToNull, imageUrlSchema.nullable().optional()),
});

export type NequiSettingsInput = z.infer<typeof nequiSettingsSchema>;

/** Valida la configuración: si se activa, exige número válido (el QR es opcional). */
export function validateNequiSettings(b: NequiSettingsInput):
  { ok: true; number: string | null } | { ok: false; error: string } {
  const number = b.number ? normalizeNequiNumber(b.number) : null;
  if (b.number && !number) return { ok: false, error: 'El número Nequi debe ser un celular de 10 dígitos que empiece por 3' };
  if (b.enabled && !number) return { ok: false, error: 'Para activar Nequi ingresa el número de la cuenta' };
  return { ok: true, number };
}

export const proofSchema = z.object({
  proofDataUrl: z.string().min(30).max(3_000_000),
  note: z.preprocess(emptyToNull, z.string().trim().max(200).nullable().optional()),
});

/** Decodifica y valida el comprobante (PNG/JPG/WebP reales, máx. 2 MB). */
export function decodeProof(dataUrl: string): { mime: string; data: Buffer } | { error: string } {
  const img = decodeImageDataUrl(dataUrl);
  if (!img) return { error: 'El comprobante debe ser una imagen PNG, JPG o WebP' };
  if (img.data.length > MAX_IMAGE_BYTES) return { error: 'El comprobante supera 2 MB' };
  return img;
}

export interface Queryable { query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }> }

export async function saveProof(db: Queryable, tenantId: string, userId: string, img: { mime: string; data: Buffer }): Promise<string> {
  const r = await db.query(
    `INSERT INTO payment_proofs (tenant_id, uploaded_by, mime, size_bytes, data) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [tenantId, userId, img.mime, img.data.length, img.data],
  );
  return (r.rows[0] as { id: string }).id;
}

/** Respuesta HTTP privada para un comprobante (no se cachea en proxies). */
export const PROOF_HEADERS = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'none'",
};
