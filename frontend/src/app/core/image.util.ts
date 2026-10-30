/**
 * Prepara una imagen elegida en el equipo para subirla:
 * valida tipo/tamaño y la reduce en el navegador (canvas) para que pese poco.
 */
export const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
export const MAX_SOURCE_BYTES = 8 * 1024 * 1024; // archivo original
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024; // límite del servidor

export function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('El archivo no es una imagen válida'));
    img.src = src;
  });
}

/**
 * Devuelve un data URL listo para el API.
 * @param maxSide lado mayor máximo en píxeles (logo 512, portada 1600).
 */
export async function prepareImage(file: File, maxSide: number): Promise<string> {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    throw new Error('Usa una imagen PNG, JPG o WebP.');
  }
  if (file.size > MAX_SOURCE_BYTES) throw new Error('La imagen supera 8 MB.');

  const original = await readAsDataUrl(file);
  const img = await loadImage(original);
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return original;
  ctx.drawImage(img, 0, 0, w, h);

  // PNG conserva transparencia (logos); JPEG para fotos de portada.
  const keepAlpha = file.type !== 'image/jpeg';
  let out = keepAlpha ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.86);
  if (keepAlpha && approxBytes(out) > 600 * 1024) {
    const webp = canvas.toDataURL('image/webp', 0.9);
    if (webp.startsWith('data:image/webp')) out = webp;
  }
  if (approxBytes(out) > MAX_UPLOAD_BYTES) {
    out = canvas.toDataURL('image/jpeg', 0.8);
  }
  if (approxBytes(out) > MAX_UPLOAD_BYTES) throw new Error('La imagen es demasiado pesada. Prueba con otra.');
  return out;
}

export function approxBytes(dataUrl: string): number {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  return Math.floor((base64.length * 3) / 4);
}
