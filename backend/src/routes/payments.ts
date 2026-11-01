/**
 * Pagos en línea de citas con la cuenta Wompi de cada negocio (micrositio).
 *
 *  - GET  /api/payments/tenant/wompi                (owner) configuración (secretos enmascarados)
 *  - PUT  /api/payments/tenant/wompi                (owner) guarda llaves (cifradas) y modo de cobro
 *  - POST /api/payments/appointments/:id/checkout   (customer) datos firmados para pagar una cita
 *  - POST /api/payments/wompi/:tenantId/webhook     (público) evento de Wompi del negocio
 *  - GET/PUT /api/payments/tenant/nequi             (owner) número, titular y QR de Nequi del negocio
 *  - POST /api/payments/appointments/:id/nequi      (customer) reporta el pago con comprobante
 *  - GET  /api/payments/tenant/review               (owner) pagos Nequi de citas por revisar/recientes
 *  - GET  /api/payments/tenant/payments/:id/proof   (owner) comprobante (privado)
 *  - POST /api/payments/tenant/payments/:id/approve|reject (owner)
 *
 * El dinero va directo a la cuenta Wompi del negocio. La plataforma solo firma
 * el checkout con el secreto de integridad del negocio y valida sus eventos.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query, withTransaction } from '../db/pool.ts';
import { parseOr400 } from '../lib/validation.ts';
import { config } from '../config.ts';
import { encryptSecret, maskSecret } from '../lib/crypto.ts';
import { getTenantWompi, keyMatchesEnv, tenantWompiReady } from '../lib/wompi-config.ts';
import { integritySignature, newReference, verifyEventSignature, type WompiEvent } from '../lib/wompi.ts';
import { getEntitlements } from '../lib/plan-features.ts';
import { mapStatus } from './billing.ts';
import { decodeProof, nequiSettingsSchema, PROOF_HEADERS, proofSchema, saveProof, validateNequiSettings } from '../lib/nequi.ts';

/** Configuración de cobro del negocio (Nequi y modo de cobro), aunque no tenga Wompi. */
export async function getTenantNequi(tenantId: string): Promise<{
  enabled: boolean; number: string | null; holder: string | null; qrUrl: string | null;
  chargeMode: 'full' | 'deposit'; depositPct: number;
}> {
  const { rows } = await query<{ nequi_enabled: boolean; nequi_number: string | null; nequi_holder: string | null; nequi_qr_url: string | null; charge_mode: 'full' | 'deposit'; deposit_pct: number }>(
    `SELECT nequi_enabled, nequi_number, nequi_holder, nequi_qr_url, charge_mode, deposit_pct
       FROM tenant_payment_settings WHERE tenant_id=$1`,
    [tenantId],
  );
  const r = rows[0];
  return {
    enabled: !!r?.nequi_enabled && !!r?.nequi_number,
    number: r?.nequi_number ?? null, holder: r?.nequi_holder ?? null, qrUrl: r?.nequi_qr_url ?? null,
    chargeMode: r?.charge_mode ?? 'full', depositPct: r?.deposit_pct ?? 30,
  };
}

const emptyToNull = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v);
const optKey = z.preprocess(emptyToNull, z.string().trim().max(200).nullable().optional());

const tenantWompiSchema = z.object({
  enabled: z.boolean(),
  environment: z.enum(['test', 'prod']),
  publicKey: optKey,
  integritySecret: optKey,
  eventsSecret: optKey,
  chargeMode: z.enum(['full', 'deposit']).default('full'),
  depositPct: z.number().int().min(1).max(100).default(30),
  clear: z.array(z.enum(['integritySecret', 'eventsSecret'])).default([]),
});

/** Valor a cobrar de una cita según el modo del negocio (función pura). */
export function appointmentChargeCop(priceCop: number, mode: 'full' | 'deposit', depositPct: number): number {
  if (priceCop <= 0) return 0;
  if (mode === 'deposit') return Math.max(1, Math.round((priceCop * depositPct) / 100));
  return priceCop;
}

export default async function paymentRoutes(app: FastifyInstance): Promise<void> {
  const owner = { preHandler: [app.requireRole('owner')] };
  const customer = { preHandler: [app.requireRole('customer')] };

  // --- Configuración del negocio ---
  app.get('/tenant/wompi', owner, async (req) => {
    const tenantId = req.user.tenantId!;
    const t = await getTenantWompi(tenantId);
    const ent = await getEntitlements(tenantId);
    return {
      enabled: t?.enabled ?? false,
      environment: t?.environment ?? 'test',
      publicKey: t?.publicKey ?? null,
      integritySecret: maskSecret(t?.integritySecret),
      eventsSecret: maskSecret(t?.eventsSecret),
      chargeMode: t?.chargeMode ?? 'full',
      depositPct: t?.depositPct ?? 30,
      ready: tenantWompiReady(t),
      planAllows: ent.features.online_payment,
      webhookUrl: `${config.APP_URL.replace(/\/$/, '')}/api/payments/wompi/${tenantId}/webhook`,
    };
  });

  app.put('/tenant/wompi', owner, async (req, reply) => {
    const b = parseOr400(tenantWompiSchema, req.body, reply);
    if (!b) return;
    const tenantId = req.user.tenantId!;
    if (b.publicKey && !keyMatchesEnv(b.publicKey, 'pub', b.environment)) {
      return reply.code(400).send({ error: `La llave pública debe empezar por pub_${b.environment}_` });
    }
    if (b.enabled) {
      const ent = await getEntitlements(tenantId);
      if (!ent.features.online_payment) {
        return reply.code(403).send({ error: 'Tu plan no incluye pagos en línea. Cambia de plan para activarlos.' });
      }
    }
    const k = config.ENCRYPTION_KEY;
    const current = await getTenantWompi(tenantId);
    const integrityEnc = b.clear.includes('integritySecret') ? null
      : b.integritySecret ? encryptSecret(b.integritySecret, k) : undefined;
    const eventsEnc = b.clear.includes('eventsSecret') ? null
      : b.eventsSecret ? encryptSecret(b.eventsSecret, k) : undefined;

    const willHavePub = b.publicKey ?? current?.publicKey ?? null;
    const willHaveIntegrity = integrityEnc === null ? false : integrityEnc !== undefined || !!current?.integritySecret;
    if (b.enabled && (!willHavePub || !willHaveIntegrity)) {
      return reply.code(400).send({ error: 'Para activar los pagos ingresa la llave pública y el secreto de integridad' });
    }

    await query(
      `INSERT INTO tenant_payment_settings (tenant_id, enabled, wompi_environment, wompi_public_key,
              wompi_integrity_enc, wompi_events_enc, charge_mode, deposit_pct, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now())
       ON CONFLICT (tenant_id) DO UPDATE SET enabled=EXCLUDED.enabled, wompi_environment=EXCLUDED.wompi_environment,
              wompi_public_key=EXCLUDED.wompi_public_key,
              wompi_integrity_enc=CASE WHEN $9 THEN EXCLUDED.wompi_integrity_enc ELSE tenant_payment_settings.wompi_integrity_enc END,
              wompi_events_enc=CASE WHEN $10 THEN EXCLUDED.wompi_events_enc ELSE tenant_payment_settings.wompi_events_enc END,
              charge_mode=EXCLUDED.charge_mode, deposit_pct=EXCLUDED.deposit_pct, updated_at=now()`,
      [tenantId, b.enabled, b.environment, willHavePub, integrityEnc ?? null, eventsEnc ?? null,
       b.chargeMode, b.depositPct, integrityEnc !== undefined, eventsEnc !== undefined],
    );
    await query('UPDATE tenant_settings SET online_payment=$1, updated_at=now() WHERE tenant_id=$2', [b.enabled, tenantId]);
    return { ok: true };
  });

  // --- Pagar una cita ---
  app.post('/appointments/:id/checkout', customer, async (req, reply) => {
    const id = (req.params as { id: string }).id;
    if (!z.string().uuid().safeParse(id).success) return reply.code(404).send({ error: 'Cita no encontrada' });
    const appt = await query<{ id: string; tenant_id: string; status: string; payment_status: string; price_cop: number; customer_email: string | null }>(
      `SELECT a.id, a.tenant_id, a.status, a.payment_status, s.price_cop, a.customer_email
         FROM appointments a JOIN services s ON s.id = a.service_id
        WHERE a.id=$1 AND a.customer_id=$2`,
      [id, req.user.id],
    );
    const a = appt.rows[0];
    if (!a) return reply.code(404).send({ error: 'Cita no encontrada' });
    if (!['booked', 'confirmed'].includes(a.status)) return reply.code(400).send({ error: 'Esta cita ya no se puede pagar' });
    if (a.payment_status === 'paid') return reply.code(409).send({ error: 'Esta cita ya está pagada' });

    const t = await getTenantWompi(a.tenant_id);
    const ent = await getEntitlements(a.tenant_id);
    if (!tenantWompiReady(t) || !ent.features.online_payment) {
      return reply.code(400).send({ error: 'Este negocio no recibe pagos en línea' });
    }
    const amountCop = appointmentChargeCop(a.price_cop, t.chargeMode, t.depositPct);
    if (amountCop <= 0) return reply.code(400).send({ error: 'Este servicio no tiene valor a pagar' });
    const amountInCents = amountCop * 100;
    const reference = newReference(a.tenant_id, 'apt');

    await withTransaction(async (client) => {
      await client.query(
        `INSERT INTO appointment_payments (tenant_id, appointment_id, reference, amount_in_cents)
         VALUES ($1,$2,$3,$4)`,
        [a.tenant_id, a.id, reference, amountInCents],
      );
      await client.query(`UPDATE appointments SET payment_status='pending' WHERE id=$1 AND payment_status='none'`, [a.id]);
    });

    return {
      publicKey: t.publicKey,
      currency: 'COP',
      amountInCents,
      reference,
      signatureIntegrity: integritySignature(reference, amountInCents, 'COP', t.integritySecret),
      redirectUrl: `${config.APP_URL}/mis-citas`,
      customerEmail: a.customer_email,
      isDeposit: t.chargeMode === 'deposit',
    };
  });

  // --- Webhook de Wompi del negocio ---
  app.post('/wompi/:tenantId/webhook', async (req, reply) => {
    const tenantId = (req.params as { tenantId: string }).tenantId;
    if (!z.string().uuid().safeParse(tenantId).success) return reply.code(404).send({ error: 'No encontrado' });
    const t = await getTenantWompi(tenantId);
    const body = req.body as WompiEvent;
    const header = req.headers['x-event-checksum'] as string | undefined;
    if (!t?.eventsSecret || !body?.event || !verifyEventSignature(body, header, t.eventsSecret)) {
      return reply.code(401).send({ error: 'Firma inválida' });
    }
    if (body.event !== 'transaction.updated') return { ok: true };
    const tx = (body.data as { transaction?: Record<string, unknown> }).transaction;
    if (!tx) return { ok: true };

    const reference = String(tx['reference'] ?? '');
    const status = mapStatus(String(tx['status'] ?? ''));
    const amount = Number(tx['amount_in_cents'] ?? NaN);

    await withTransaction(async (client) => {
      const r = await client.query<{ id: string; appointment_id: string; status: string; amount_in_cents: number }>(
        `SELECT id, appointment_id, status, amount_in_cents FROM appointment_payments
          WHERE reference=$1 AND tenant_id=$2 FOR UPDATE`,
        [reference, tenantId],
      );
      const p = r.rows[0];
      if (!p || p.status === 'approved') return;
      const final = status === 'approved' && !Number.isNaN(amount) && amount !== p.amount_in_cents ? 'error' : status;
      await client.query(
        `UPDATE appointment_payments SET status=$1, wompi_transaction_id=$2, updated_at=now() WHERE id=$3`,
        [final, String(tx['id'] ?? ''), p.id],
      );
      if (final === 'approved') {
        await client.query(`UPDATE appointments SET payment_status='paid' WHERE id=$1`, [p.appointment_id]);
      } else if (final !== 'pending') {
        await client.query(
          `UPDATE appointments SET payment_status='none'
            WHERE id=$1 AND payment_status='pending'
              AND NOT EXISTS (SELECT 1 FROM appointment_payments x
                               WHERE x.appointment_id=$1 AND x.status IN ('pending','approved') AND x.id<>$2)`,
          [p.appointment_id, p.id],
        );
      }
    });
    return { ok: true };
  });

  // ------------------------------------------------------------------
  // Nequi del negocio
  // ------------------------------------------------------------------
  app.get('/tenant/nequi', owner, async (req) => {
    const n = await getTenantNequi(req.user.tenantId!);
    const ent = await getEntitlements(req.user.tenantId!);
    const { rows } = await query<{ enabled: boolean }>('SELECT nequi_enabled AS enabled FROM tenant_payment_settings WHERE tenant_id=$1', [req.user.tenantId]);
    return { ...n, enabled: rows[0]?.enabled ?? false, planAllows: ent.features.online_payment };
  });

  app.put('/tenant/nequi', owner, async (req, reply) => {
    const b = parseOr400(nequiSettingsSchema, req.body, reply);
    if (!b) return;
    const v = validateNequiSettings(b);
    if (!v.ok) return reply.code(400).send({ error: v.error });
    if (b.enabled && !(await getEntitlements(req.user.tenantId!)).features.online_payment) {
      return reply.code(403).send({ error: 'Tu plan no incluye pagos de citas. Cambia de plan para activarlos.' });
    }
    await query(
      `INSERT INTO tenant_payment_settings (tenant_id, nequi_enabled, nequi_number, nequi_holder, nequi_qr_url, updated_at)
       VALUES ($1,$2,$3,$4,$5, now())
       ON CONFLICT (tenant_id) DO UPDATE SET nequi_enabled=EXCLUDED.nequi_enabled, nequi_number=EXCLUDED.nequi_number,
              nequi_holder=EXCLUDED.nequi_holder, nequi_qr_url=EXCLUDED.nequi_qr_url, updated_at=now()`,
      [req.user.tenantId, b.enabled, v.number, b.holder ?? null, b.qrUrl ?? null],
    );
    return { ok: true };
  });

  // El cliente reporta que pagó su cita por Nequi (con comprobante).
  app.post('/appointments/:id/nequi', { ...customer, bodyLimit: 4 * 1024 * 1024 }, async (req, reply) => {
    const id = (req.params as { id: string }).id;
    if (!z.string().uuid().safeParse(id).success) return reply.code(404).send({ error: 'Cita no encontrada' });
    const body = parseOr400(proofSchema, req.body, reply);
    if (!body) return;
    const appt = await query<{ id: string; tenant_id: string; status: string; payment_status: string; price_cop: number }>(
      `SELECT a.id, a.tenant_id, a.status, a.payment_status, s.price_cop
         FROM appointments a JOIN services s ON s.id = a.service_id
        WHERE a.id=$1 AND a.customer_id=$2`,
      [id, req.user.id],
    );
    const a = appt.rows[0];
    if (!a) return reply.code(404).send({ error: 'Cita no encontrada' });
    if (!['booked', 'confirmed'].includes(a.status)) return reply.code(400).send({ error: 'Esta cita ya no se puede pagar' });
    if (a.payment_status === 'paid') return reply.code(409).send({ error: 'Esta cita ya está pagada' });
    const n = await getTenantNequi(a.tenant_id);
    if (!n.enabled || !(await getEntitlements(a.tenant_id)).features.online_payment) {
      return reply.code(400).send({ error: 'Este negocio no recibe pagos por Nequi' });
    }
    const dup = await query(`SELECT 1 FROM appointment_payments WHERE appointment_id=$1 AND provider='nequi' AND status='pending'`, [a.id]);
    if (dup.rowCount) return reply.code(409).send({ error: 'Tu comprobante ya está en revisión' });
    const amountCop = appointmentChargeCop(a.price_cop, n.chargeMode, n.depositPct);
    if (amountCop <= 0) return reply.code(400).send({ error: 'Este servicio no tiene valor a pagar' });
    const img = decodeProof(body.proofDataUrl);
    if ('error' in img) return reply.code(400).send({ error: img.error });
    const reference = newReference(a.tenant_id, 'neq');
    await withTransaction(async (client) => {
      const proofId = await saveProof(client, a.tenant_id, req.user.id, img);
      await client.query(
        `INSERT INTO appointment_payments (tenant_id, appointment_id, reference, amount_in_cents, provider, proof_id, payer_note)
         VALUES ($1,$2,$3,$4,'nequi',$5,$6)`,
        [a.tenant_id, a.id, reference, amountCop * 100, proofId, body.note ?? null],
      );
      await client.query(`UPDATE appointments SET payment_status='pending' WHERE id=$1 AND payment_status='none'`, [a.id]);
    });
    return reply.code(201).send({ ok: true, reference, amountCop, status: 'pending' });
  });

  // Pagos Nequi de citas: pendientes primero, luego los últimos revisados.
  app.get('/tenant/review', owner, async (req) => {
    const { rows } = await query(
      `SELECT ap.id, ap.reference, ap.status, ap.amount_in_cents / 100 AS "amountCop", ap.created_at AS "createdAt",
              ap.payer_note AS "payerNote", ap.review_note AS "reviewNote", (ap.proof_id IS NOT NULL) AS "hasProof",
              a.starts_at AS "startsAt", a.customer_name AS "customerName", s.name AS "serviceName"
         FROM appointment_payments ap
         JOIN appointments a ON a.id = ap.appointment_id
         JOIN services s ON s.id = a.service_id
        WHERE ap.tenant_id=$1 AND ap.provider='nequi'
          AND (ap.status='pending' OR ap.updated_at > now() - interval '30 days')
        ORDER BY (ap.status='pending') DESC, ap.created_at DESC
        LIMIT 100`,
      [req.user.tenantId],
    );
    return rows;
  });

  app.get('/tenant/payments/:id/proof', owner, async (req, reply) => {
    const id = (req.params as { id: string }).id;
    if (!z.string().uuid().safeParse(id).success) return reply.code(404).send({ error: 'No encontrado' });
    const { rows } = await query<{ mime: string; data: Buffer }>(
      `SELECT pp.mime, pp.data FROM appointment_payments ap JOIN payment_proofs pp ON pp.id = ap.proof_id
        WHERE ap.id=$1 AND ap.tenant_id=$2`,
      [id, req.user.tenantId],
    );
    if (!rows[0]) return reply.code(404).send({ error: 'Sin comprobante' });
    return reply.headers({ ...PROOF_HEADERS, 'Content-Type': rows[0].mime }).send(rows[0].data);
  });

  const reviewSchema = z.object({ note: z.preprocess((v) => (typeof v === 'string' && !v.trim() ? null : v), z.string().trim().max(200).nullable().optional()) });

  app.post('/tenant/payments/:id/approve', owner, async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const b = parseOr400(reviewSchema, req.body ?? {}, reply);
    if (!b) return;
    if (!z.string().uuid().safeParse(id).success) return reply.code(404).send({ error: 'No encontrado' });
    const ok = await withTransaction(async (client) => {
      const r = await client.query<{ appointment_id: string }>(
        `UPDATE appointment_payments SET status='approved', reviewed_by=$1, reviewed_at=now(), review_note=$2, updated_at=now()
          WHERE id=$3 AND tenant_id=$4 AND provider='nequi' AND status='pending' RETURNING appointment_id`,
        [req.user.id, b.note ?? null, id, req.user.tenantId],
      );
      if (!r.rows[0]) return false;
      await client.query(`UPDATE appointments SET payment_status='paid' WHERE id=$1`, [r.rows[0].appointment_id]);
      return true;
    });
    if (!ok) return reply.code(400).send({ error: 'Solo se aprueban pagos Nequi pendientes' });
    return { ok: true };
  });

  app.post('/tenant/payments/:id/reject', owner, async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const b = parseOr400(reviewSchema, req.body ?? {}, reply);
    if (!b) return;
    if (!z.string().uuid().safeParse(id).success) return reply.code(404).send({ error: 'No encontrado' });
    const ok = await withTransaction(async (client) => {
      const r = await client.query<{ appointment_id: string }>(
        `UPDATE appointment_payments SET status='declined', reviewed_by=$1, reviewed_at=now(), review_note=$2, updated_at=now()
          WHERE id=$3 AND tenant_id=$4 AND provider='nequi' AND status='pending' RETURNING appointment_id`,
        [req.user.id, b.note ?? 'Comprobante no válido', id, req.user.tenantId],
      );
      if (!r.rows[0]) return false;
      await client.query(
        `UPDATE appointments SET payment_status='none'
          WHERE id=$1 AND payment_status='pending'
            AND NOT EXISTS (SELECT 1 FROM appointment_payments x WHERE x.appointment_id=$1 AND x.status IN ('pending','approved'))`,
        [r.rows[0].appointment_id],
      );
      return true;
    });
    if (!ok) return reply.code(400).send({ error: 'Solo se rechazan pagos Nequi pendientes' });
    return { ok: true };
  });
}
