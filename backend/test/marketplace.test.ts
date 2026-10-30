/** Tests de reglas puras del directorio/autogestión (sin BD). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { imageUrlSchema, isReservedSlug, slugSchema } from '../src/lib/validation.ts';
import { decodeImageDataUrl, sniffImage } from '../src/lib/image.ts';

// PNG 1x1 transparente
const PNG_1PX =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

test('slug personalizado: acepta links válidos', () => {
  for (const s of ['barberia-figaro', 'spa2', 'abc', 'clinica-dental-sur-123']) {
    assert.equal(slugSchema.safeParse(s).success, true, s);
  }
});

test('slug personalizado: rechaza formatos inválidos y rutas reservadas', () => {
  for (const s of ['ab', '-barberia', 'barberia-', 'Barberia', 'bar beria', 'barbería', 'a--b', 'login', 'admin', 'panel', 'api']) {
    assert.equal(slugSchema.safeParse(s).success, false, s);
  }
  assert.equal(isReservedSlug('mis-citas'), true);
  assert.equal(isReservedSlug('mi-negocio'), false);
});

test('imagen: acepta PNG real y rechaza tipo falso', () => {
  const ok = decodeImageDataUrl(`data:image/png;base64,${PNG_1PX}`);
  assert.ok(ok);
  assert.equal(ok.mime, 'image/png');
  // Declara JPEG pero el contenido es PNG
  assert.equal(decodeImageDataUrl(`data:image/jpeg;base64,${PNG_1PX}`), null);
  // SVG no permitido
  assert.equal(decodeImageDataUrl('data:image/svg+xml;base64,PHN2Zy8+'), null);
  // Texto disfrazado de PNG
  assert.equal(decodeImageDataUrl(`data:image/png;base64,${Buffer.from('<script>alert(1)</script>').toString('base64')}`), null);
});

test('imagen: detecta JPEG y WebP por firma', () => {
  assert.equal(sniffImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0])), 'image/jpeg');
  assert.equal(sniffImage(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 ')])), 'image/webp');
  assert.equal(sniffImage(Buffer.from('GIF89a')), null);
});

test('url de imagen: media interna o http(s), nunca javascript:', () => {
  assert.equal(imageUrlSchema.safeParse('/api/media/1b4e28ba-2fa1-11d2-883f-0016d3cca427').success, true);
  assert.equal(imageUrlSchema.safeParse('https://cdn.ejemplo.com/logo.png').success, true);
  assert.equal(imageUrlSchema.safeParse('javascript:alert(1)').success, false);
  assert.equal(imageUrlSchema.safeParse('/api/media/../../etc').success, false);
});

import { zonedToUtc } from '../src/lib/time.ts';

test('horario del negocio: 08:00 en Bogotá es 13:00 UTC', () => {
  assert.equal(zonedToUtc('2026-10-30', '08:00:00', 'America/Bogota').toISOString(), '2026-10-30T13:00:00.000Z');
  assert.equal(zonedToUtc('2026-07-01', '09:30', 'Europe/Madrid').toISOString(), '2026-07-01T07:30:00.000Z');
  assert.equal(zonedToUtc('2026-01-15', '09:30', 'Europe/Madrid').toISOString(), '2026-01-15T08:30:00.000Z');
});
