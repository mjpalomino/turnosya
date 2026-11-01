/**
 * Cobro de suscripción con Wompi (plataforma).
 *
 *  - POST /api/billing/quote           (owner) cotiza plan + ciclo (1, 3 o 6 meses) con descuentos
 *  - POST /api/billing/checkout        (owner) crea el pago pendiente y devuelve los datos firmados
 *  - POST /api/billing/wompi/webhook   (público) transaction.updated; renueva al aprobarse
 *  - GET  /api/billing/acceptance      (owner) tokens para tokenizar la tarjeta
 *  - POST /api/billing/auto-renew      (owner) guarda la tarjeta y activa el cobro automático del ciclo
 *  - POST /api/billing/auto-renew/cancel
 *  - GET  /api/billing/subscription    (owner) estado, plan, ciclo, funcionalidades y límites
 *  - GET  /api/billing/payments        (owner) historial de pagos con descuentos
 *  - GET  /api/billing/referrals       (owner) mi código, mis referidos y recompensas
 *  - POST /api/billing/referral        (owner) aplicar un código de referido antes del primer pago
 *
 * Las credenciales de Wompi salen del panel del superadmin o, si no están, del entorno.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query, withTransaction } from '../db/pool.ts';
import { parseOr400 } from '../lib/validation.ts';
import { config } from '../config.ts';
import {
  integritySignature, newReference, verifyEventSignature,
  getAcceptanceTokens, createPaymentSource, type WompiEvent,
} from '../lib/wompi.ts';
import { getPlatformWompi } from '../lib/wompi-config.ts';
import { CYCLE_LABELS, newReferralCode } from '../lib/pricing.ts';
import {
  applyApprovedPayment, attachReferral, checkReferralCode, ensureReferralCode,
  getActivePlan, getReferralSettings, quoteForTenant,
} from '../lib/subscription-billing.ts';
import { getEntitlements, PLAN_FEATURES } from '../lib/plan-features.ts';

const cycleSchema = z.union([z.literal(1), z.literal(3), z.literal(6)]);

const checkoutSchema = z.object({
  planId: z.string().uuid(),
  months: cycleSchema.optional(),
  /** Compatibilidad con el front anterior. */
  periodMonths: cycleSchema.optional(),
});

const autoPaySchema = z.object({
  cardToken: z.string().min(5),
  payerEmail: z.string().email(),
  planId: z.string().uuid(),
  months: cycleSchema.default(1),
});

const referralSchema = z.object({ code: z.string().trim().min(4).max(20) });

/** Mapea el estado de Wompi al estado local de pago. */
export function mapStatus(wompi: string): 'approved' | 'declined' | 'voided' | 'error' | 'pending' {
  switch (wompi) {
    case 'APPROVED': return 'approved';
    case 'DECLINED': return 'declined';
    case 'VOIDED': return 'voided';
    case 'ERROR': return 'error';
    default: return 'pending';
  }
}

export default async function billingRoutes(app: FastifyInstance): Promise<void> {
  const owner = { preHandler: [app.requireRole('owner')] };

  // --- Cotización ---
  app.post('/quote', owner, async (req, reply) => {
    const body = parseOr400(checkoutSchema, req.body, reply);
    if (!body) return;
    const plan = await getActivePlan(body.planId);
    if (!plan) return reply.code(404).send({ error: 'Plan no encontrado' });
    const months = body.months ?? body.periodMonths ?? 1;
    const q = await quoteForTenant(req.user.tenantId!, plan, months);
    return { ...q, cycleLabel: CYCLE_LABELS[months] };
  });

  // --- Crear checkout ---
  app.post('/checkout', owner, async (req, reply) => {
    const creds = await getPlatformWompi();
    if (!creds.publicKey || !creds.integritySecret) {
      return reply.code(503).send({ error: 'El pago en línea no está configurado' });
    }
    const body = parseOr400(checkoutSchema, req.body, reply);
    if (!body) return;
    const plan = await getActivePlan(body.planId);
    if (!plan) return reply.code(404).send({ error: 'Plan no encontrado' });

    const months = body.months ?? body.periodMonths ?? 1;
    const q = await quoteForTenant(req.user.tenantId!, plan, months);
    if (q.totalCop <= 0) {
      return reply.code(400).send({ error: 'El valor a pagar es 0. Contacta a soporte para activar tu plan.' });
    }
    const amountInCents = q.totalCop * 100;
    const reference = newReference(req.user.tenantId!);

    await query(
      `INSERT INTO subscription_payments
         (tenant_id, plan_id, reference, amount_in_cents, currency, status, period_months,
          base_amount_in_cents, discount_in_cents, discount_detail, referral_id, reward_referral_id)
       VALUES ($1,$2,$3,$4,'COP','pending',$5,$6,$7,$8,$9,$10)`,
      [req.user.tenantId, plan.id, reference, amountInCents, months,
       q.baseCop * 100, q.discountCop * 100, JSON.stringify(q.discounts), q.referralId, q.rewardReferralId],
    );

    const signature = integritySignature(reference, amountInCents, 'COP', creds.integritySecret);
    return reply.send({
      publicKey: creds.publicKey,
      currency: 'COP',
      amountInCents,
      reference,
      signatureIntegrity: signature,
      redirectUrl: `${config.APP_URL}/panel?tab=subscription`,
      quote: q,
    });
  });

  // --- Webhook de Wompi (suscripciones) ---
  // Público: no lleva JWT. La autenticidad se valida con la firma del evento.
  app.post('/wompi/webhook', async (req, reply) => {
    const body = req.body as WompiEvent;
    const headerChecksum = req.headers['x-event-checksum'] as string | undefined;
    const creds = await getPlatformWompi();

    if (!body?.event || !verifyEventSignature(body, headerChecksum, creds.eventsSecret)) {
      return reply.code(401).send({ error: 'Firma inválida' });
    }
    if (body.event !== 'transaction.updated') return reply.code(200).send({ ok: true });

    const tx = (body.data as { transaction?: Record<string, unknown> }).transaction;
    if (!tx) return reply.code(200).send({ ok: true });

    const reference = String(tx['reference'] ?? '');
    const wompiStatus = String(tx['status'] ?? '');
    const wompiId = String(tx['id'] ?? '');
    const amount = Number(tx['amount_in_cents'] ?? NaN);
    const localStatus = mapStatus(wompiStatus);

    await withTransaction(async (client) => {
      const pay = await client.query<{
        id: string; tenant_id: string; plan_id: string | null; period_months: number; status: string;
        amount_in_cents: number; referral_id: string | null; reward_referral_id: string | null;
      }>(
        `SELECT id, tenant_id, plan_id, period_months, status, amount_in_cents, referral_id, reward_referral_id
           FROM subscription_payments WHERE reference=$1 FOR UPDATE`,
        [reference],
      );
      if (!pay.rowCount) return; // referencia desconocida: nada que hacer
      const p = pay.rows[0]!;
      if (p.status === 'approved') return; // idempotencia

      // Un monto distinto al registrado se marca como error y no renueva.
      const amountOk = Number.isNaN(amount) || amount === p.amount_in_cents;
      const finalStatus = localStatus === 'approved' && !amountOk ? 'error' : localStatus;

      await client.query(
        `UPDATE subscription_payments SET status=$1, wompi_transaction_id=$2, updated_at=now() WHERE id=$3`,
        [finalStatus, wompiId, p.id],
      );
      if (finalStatus === 'approved') await applyApprovedPayment(client, p);
    });

    return reply.code(200).send({ ok: true });
  });

  // --- Tokens de aceptación para el widget de tokenización de tarjeta ---
  app.get('/acceptance', owner, async (_req, reply) => {
    const creds = await getPlatformWompi();
    if (!creds.publicKey) return reply.code(503).send({ error: 'El pago en línea no está configurado' });
    try {
      const tokens = await getAcceptanceTokens(creds);
      return reply.send({ publicKey: creds.publicKey, ...tokens });
    } catch {
      return reply.code(502).send({ error: 'No se pudo contactar a Wompi' });
    }
  });

  // --- Activar auto-renovación: registra la fuente de pago tokenizada ---
  app.post('/auto-renew', owner, async (req, reply) => {
    const creds = await getPlatformWompi();
    if (!creds.privateKey) return reply.code(503).send({ error: 'El cobro automático no está configurado' });
    const body = parseOr400(autoPaySchema, req.body, reply);
    if (!body) return;

    const plan = await getActivePlan(body.planId);
    if (!plan) return reply.code(404).send({ error: 'Plan no encontrado' });

    try {
      const tokens = await getAcceptanceTokens(creds);
      const sourceId = await createPaymentSource({
        token: body.cardToken,
        customerEmail: body.payerEmail,
        acceptanceToken: tokens.acceptanceToken,
        personalAuthToken: tokens.personalAuthToken,
      }, creds);
      await query(
        `UPDATE subscriptions
            SET wompi_payment_source_id=$1, payer_email=$2, auto_renew=true,
                plan_id=$3, billing_cycle_months=$4, failed_charges=0, updated_at=now()
          WHERE tenant_id=$5`,
        [sourceId, body.payerEmail, body.planId, body.months, req.user.tenantId],
      );
      return reply.send({ ok: true, autoRenew: true });
    } catch {
      return reply.code(502).send({ error: 'No se pudo registrar la tarjeta en Wompi' });
    }
  });

  app.post('/auto-renew/cancel', owner, async (req) => {
    await query(
      `UPDATE subscriptions SET auto_renew=false, updated_at=now() WHERE tenant_id=$1`,
      [req.user.tenantId],
    );
    return { ok: true, autoRenew: false };
  });

  // --- Estado de la suscripción ---
  app.get('/subscription', owner, async (req) => {
    const { rows } = await query(
      `SELECT s.status, s.trial_ends_at AS "trialEndsAt", s.current_period_end AS "currentPeriodEnd",
              s.auto_renew AS "autoRenew", s.payer_email AS "payerEmail",
              (s.wompi_payment_source_id IS NOT NULL) AS "hasCard",
              s.plan_id AS "planId", p.name AS "planName",
              s.billing_cycle_months AS "billingCycleMonths"
         FROM subscriptions s LEFT JOIN plans p ON p.id = s.plan_id
        WHERE s.tenant_id=$1`,
      [req.user.tenantId],
    );
    if (!rows[0]) return null;
    const ent = await getEntitlements(req.user.tenantId!);
    return {
      ...rows[0],
      features: ent.features,
      limits: ent.limits,
      featureCatalog: PLAN_FEATURES,
    };
  });

  // --- Historial de pagos ---
  app.get('/payments', owner, async (req) => {
    const { rows } = await query(
      `SELECT sp.reference, sp.amount_in_cents AS "amountInCents", sp.currency, sp.status,
              sp.period_months AS "periodMonths", sp.created_at AS "createdAt",
              sp.discount_in_cents AS "discountInCents", sp.discount_detail AS "discountDetail",
              sp.provider, p.name AS "planName"
         FROM subscription_payments sp LEFT JOIN plans p ON p.id = sp.plan_id
        WHERE sp.tenant_id=$1 ORDER BY sp.created_at DESC`,
      [req.user.tenantId],
    );
    return rows;
  });

  // --- Referidos ---
  app.get('/referrals', owner, async (req) => {
    const tenantId = req.user.tenantId!;
    const settings = await getReferralSettings();
    const code = await ensureReferralCode(tenantId, () => newReferralCode());
    const sub = await query<{ status: string }>('SELECT status FROM subscriptions WHERE tenant_id=$1', [tenantId]);
    const mine = await query(
      `SELECT r.status, r.created_at AS "createdAt", t.name AS "businessName",
              r.referrer_reward_pct::float AS "rewardPct"
         FROM referrals r JOIN tenants t ON t.id = r.referred_tenant_id
        WHERE r.referrer_tenant_id=$1 ORDER BY r.created_at DESC`,
      [tenantId],
    );
    const applied = await query(
      `SELECT r.status, r.referred_discount_pct::float AS "discountPct", t.name AS "referrerName", r.code
         FROM referrals r JOIN tenants t ON t.id = r.referrer_tenant_id
        WHERE r.referred_tenant_id=$1`,
      [tenantId],
    );
    const paid = await query('SELECT 1 FROM subscription_payments WHERE tenant_id=$1 AND status=$2 LIMIT 1', [tenantId, 'approved']);
    return {
      program: settings,
      code,
      canShare: settings.enabled && sub.rows[0]?.status === 'active',
      referrals: mine.rows,
      availableRewards: mine.rows.filter((r) => (r as { status: string }).status === 'converted').length,
      applied: applied.rows[0] ?? null,
      canApplyCode: settings.enabled && !applied.rowCount && !paid.rowCount,
    };
  });

  app.post('/referral', owner, async (req, reply) => {
    const body = parseOr400(referralSchema, req.body, reply);
    if (!body) return;
    const tenantId = req.user.tenantId!;
    const paid = await query('SELECT 1 FROM subscription_payments WHERE tenant_id=$1 AND status=$2 LIMIT 1', [tenantId, 'approved']);
    if (paid.rowCount) return reply.code(400).send({ error: 'El código de referido solo aplica antes del primer pago' });
    const existing = await query('SELECT 1 FROM referrals WHERE referred_tenant_id=$1', [tenantId]);
    if (existing.rowCount) return reply.code(409).send({ error: 'Ya tienes un código de referido aplicado' });
    const check = await checkReferralCode(body.code, tenantId);
    if (!check.ok) return reply.code(400).send({ error: check.error });
    await attachReferral({ query: (t, p) => query(t, p) }, tenantId, body.code, check);
    return { ok: true, referrerName: check.referrerName, discountPct: check.settings.referralDiscountPct };
  });
}
