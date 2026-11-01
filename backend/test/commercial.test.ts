/**
 * Pruebas del módulo comercial (funciones puras, sin base de datos):
 * precios por ciclo y descuentos en cascada, códigos de referido,
 * funcionalidades por plan, cifrado de secretos y cobro de citas.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.JWT_SECRET = 'x'.repeat(32);
process.env.ENCRYPTION_KEY = 'a'.repeat(64);
process.env.DATABASE_URL = 'postgres://x:x@localhost:5432/x';
process.env.USER_ADMIN = 'admin@test.com';
process.env.PASSWORD_ADMIN = 'secret1';

const { quotePrice, cyclePct, newReferralCode, normalizeReferralCode, isBillingCycle } = await import('../src/lib/pricing.ts');
const { resolveEntitlements, sanitizeFeatures, FEATURE_KEYS } = await import('../src/lib/plan-features.ts');
const { encryptSecret, decryptSecret, maskSecret } = await import('../src/lib/crypto.ts');
const { appointmentChargeCop } = await import('../src/routes/payments.ts');
const { keyMatchesEnv } = await import('../src/lib/wompi-config.ts');

// ---------------- Precios ----------------
test('mensual: sin descuento por ciclo', () => {
  const q = quotePrice({ monthlyPriceCop: 49000, months: 1, quarterlyPct: 10, semiannualPct: 15 });
  assert.equal(q.baseCop, 49000);
  assert.equal(q.totalCop, 49000);
  assert.equal(q.discounts.length, 0);
});

test('trimestral aplica el descuento trimestral del plan', () => {
  const q = quotePrice({ monthlyPriceCop: 49000, months: 3, quarterlyPct: 10, semiannualPct: 15 });
  assert.equal(q.baseCop, 147000);
  assert.equal(q.discountCop, 14700);
  assert.equal(q.totalCop, 132300);
  assert.equal(q.effectiveMonthlyCop, 44100);
});

test('semestral aplica el descuento semestral del plan', () => {
  const q = quotePrice({ monthlyPriceCop: 99000, months: 6, quarterlyPct: 10, semiannualPct: 15 });
  assert.equal(q.baseCop, 594000);
  assert.equal(q.totalCop, 504900);
});

test('descuentos en cascada: ciclo, referido y recompensa', () => {
  const q = quotePrice({ monthlyPriceCop: 100000, months: 3, quarterlyPct: 10, referralPct: 10, rewardPct: 20 });
  // 300000 -10% = 270000 ; -10% = 243000 ; -20% = 194400
  assert.equal(q.totalCop, 194400);
  assert.deepEqual(q.discounts.map((d) => d.kind), ['cycle', 'referral', 'referrer_reward']);
  assert.equal(q.discountCop, 300000 - 194400);
});

test('el total nunca es negativo y los porcentajes se limitan a 100', () => {
  const q = quotePrice({ monthlyPriceCop: 1000, months: 1, referralPct: 150 });
  assert.equal(q.totalCop, 0);
  assert.equal(q.discounts[0]!.pct, 100);
});

test('plan gratis: total 0 sin líneas de descuento', () => {
  const q = quotePrice({ monthlyPriceCop: 0, months: 6, semiannualPct: 20, referralPct: 10 });
  assert.equal(q.totalCop, 0);
  assert.equal(q.discounts.length, 0);
});

test('cyclePct e isBillingCycle', () => {
  assert.equal(cyclePct(1, 10, 20), 0);
  assert.equal(cyclePct(3, 10, 20), 10);
  assert.equal(cyclePct(6, 10, 20), 20);
  assert.equal(isBillingCycle(3), true);
  assert.equal(isBillingCycle(12), false);
});

// ---------------- Referidos ----------------
test('código de referido: 8 caracteres sin caracteres ambiguos', () => {
  for (let i = 0; i < 200; i++) {
    const c = newReferralCode();
    assert.match(c, /^[A-HJ-NP-Z2-9]{8}$/);
  }
});

test('normaliza el código que escribe el usuario', () => {
  assert.equal(normalizeReferralCode(' ab-cd 12ef '), 'ABCD12EF');
});

// ---------------- Funcionalidades por plan ----------------
const planRow = {
  status: 'active', plan_id: 'p1', plan_name: 'Básico',
  features: { loyalty: true, online_payment: false },
  max_staff: 3, max_services: 20, max_branches: 1,
};

test('suscripción activa: aplica las funcionalidades del plan', () => {
  const e = resolveEntitlements(planRow);
  assert.equal(e.features.loyalty, true);
  assert.equal(e.features.online_payment, false);
  assert.equal(e.features.reports, false); // no definida = desactivada
  assert.equal(e.limits.maxStaff, 3);
});

test('prueba gratis: todas las funcionalidades y límites del plan asignado', () => {
  const e = resolveEntitlements({ ...planRow, status: 'trial' });
  for (const k of FEATURE_KEYS) assert.equal(e.features[k], true);
  assert.equal(e.limits.maxStaff, 3);
});

test('sin plan asignado: sin límites', () => {
  const e = resolveEntitlements({ ...planRow, status: 'trial', plan_id: null, max_staff: null });
  assert.equal(e.limits.maxStaff, null);
});

test('sanitizeFeatures solo acepta claves conocidas y booleanos verdaderos', () => {
  const f = sanitizeFeatures({ loyalty: true, online_payment: 'yes', hack: true });
  assert.equal(f.loyalty, true);
  assert.equal(f.online_payment, false);
  assert.equal('hack' in f, false);
});

// ---------------- Cifrado ----------------
test('cifra y descifra un secreto', () => {
  const key = 'b'.repeat(64);
  const enc = encryptSecret('prod_integrity_ABC123', key);
  assert.match(enc, /^v1:[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/);
  assert.notEqual(enc.includes('ABC123'), true);
  assert.equal(decryptSecret(enc, key), 'prod_integrity_ABC123');
});

test('con otra llave o datos alterados no descifra', () => {
  const enc = encryptSecret('secreto', 'b'.repeat(64));
  assert.equal(decryptSecret(enc, 'c'.repeat(64)), null);
  const tampered = enc.slice(0, -2) + (enc.endsWith('00') ? '11' : '00');
  assert.equal(decryptSecret(tampered, 'b'.repeat(64)), null);
  assert.equal(decryptSecret(null, 'b'.repeat(64)), null);
});

test('maskSecret solo muestra los últimos 4', () => {
  assert.equal(maskSecret('prv_test_123456789'), '••••6789');
  assert.equal(maskSecret(null), null);
});

// ---------------- Pagos de citas ----------------
test('valor a cobrar de una cita: completo o anticipo', () => {
  assert.equal(appointmentChargeCop(40000, 'full', 30), 40000);
  assert.equal(appointmentChargeCop(40000, 'deposit', 30), 12000);
  assert.equal(appointmentChargeCop(0, 'full', 30), 0);
  assert.equal(appointmentChargeCop(10, 'deposit', 1), 1);
});

test('prefijo de llaves según ambiente', () => {
  assert.equal(keyMatchesEnv('pub_test_abc', 'pub', 'test'), true);
  assert.equal(keyMatchesEnv('pub_prod_abc', 'pub', 'test'), false);
  assert.equal(keyMatchesEnv('prv_prod_abc', 'prv', 'prod'), true);
});
