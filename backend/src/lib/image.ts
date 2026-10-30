/** Utilidades puras para validar imágenes cargadas (sin BD). */

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

export type ImageMime = 'image/png' | 'image/jpeg' | 'image/webp';

/** Detecta el tipo real de la imagen por su firma binaria. */
export function sniffImage(buf: Buffer): ImageMime | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  return null;
}

/** Decodifica un data URL de imagen. Devuelve null si no es válido. */
export function decodeImageDataUrl(dataUrl: string): { mime: ImageMime; data: Buffer } | null {
  const m = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=\s]+)$/.exec(dataUrl);
  if (!m) return null;
  const data = Buffer.from(m[2]!.replace(/\s/g, ''), 'base64');
  const real = sniffImage(data);
  if (!real || real !== m[1]) return null;
  return { mime: real, data };
}

