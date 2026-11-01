/**
 * Cifrado simétrico para secretos guardados en la base de datos
 * (llaves privadas y secretos de Wompi de la plataforma y de cada negocio).
 *
 * AES-256-GCM con la llave ENCRYPTION_KEY (hex de 32 bytes).
 * Formato guardado: v1:<iv hex>:<tag hex>:<datos hex>
 *
 * Los valores descifrados nunca se devuelven al frontend ni se registran en logs.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const PREFIX = 'v1';

function keyFrom(hex: string): Buffer {
  const key = Buffer.from(hex, 'hex');
  if (key.length !== 32) throw new Error('ENCRYPTION_KEY inválida');
  return key;
}

export function encryptSecret(plain: string, keyHex: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyFrom(keyHex), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}:${iv.toString('hex')}:${tag.toString('hex')}:${data.toString('hex')}`;
}

export function decryptSecret(stored: string | null | undefined, keyHex: string): string | null {
  if (!stored) return null;
  const parts = stored.split(':');
  if (parts.length !== 4 || parts[0] !== PREFIX) return null;
  try {
    const decipher = createDecipheriv('aes-256-gcm', keyFrom(keyHex), Buffer.from(parts[1]!, 'hex'));
    decipher.setAuthTag(Buffer.from(parts[2]!, 'hex'));
    const out = Buffer.concat([decipher.update(Buffer.from(parts[3]!, 'hex')), decipher.final()]);
    return out.toString('utf8');
  } catch {
    return null;
  }
}

/** Muestra solo los últimos 4 caracteres de un secreto (para la interfaz). */
export function maskSecret(plain: string | null | undefined): string | null {
  if (!plain) return null;
  return `••••${plain.slice(-4)}`;
}
