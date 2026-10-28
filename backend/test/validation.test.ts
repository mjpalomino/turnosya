/** Tests de utilidades puras (sin BD). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slugify } from '../src/lib/validation.ts';
import { randomToken } from '../src/lib/token.ts';
import { hashPassword, verifyPassword } from '../src/lib/password.ts';

test('slugify quita acentos y espacios', () => {
  assert.equal(slugify('Barbería Fígaro'), 'barberia-figaro');
  assert.equal(slugify('  Spa  del  Sol  '), 'spa-del-sol');
  assert.equal(slugify('Clínica #1 (centro)'), 'clinica-1-centro');
});

test('slugify limita longitud a 60', () => {
  const s = slugify('a'.repeat(100));
  assert.ok(s.length <= 60);
});

test('randomToken genera valores únicos y url-safe', () => {
  const a = randomToken();
  const b = randomToken();
  assert.notEqual(a, b);
  assert.match(a, /^[A-Za-z0-9_-]+$/);
});

test('hashPassword y verifyPassword funcionan', async () => {
  const hash = await hashPassword('secreta123');
  assert.ok(hash.startsWith('$2'));
  assert.equal(await verifyPassword('secreta123', hash), true);
  assert.equal(await verifyPassword('otra', hash), false);
});
