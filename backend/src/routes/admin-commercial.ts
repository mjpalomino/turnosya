/**
 * Módulo comercial del superadmin (prefijo /api/admin).
 *
 *  Suscripciones y pagos
 *  - GET  /billing/summary              indicadores: MRR, recaudo, pendientes, renovaciones, etc.
 *  - GET  /subscriptions                suscripciones con plan, ciclo, vencimiento y último pago
 *  - GET  /payments                     pagos con filtros (?status&tenantId&from&to&limit&offset)
 *  - POST /payments/manual              registra un pago manual (transferencia, efectivo) y renueva
 *
 *  Referidos
 *  - GET  /referrals                    todos los referidos
 *  - POST /referrals/:id/void           anula un referido
 *  - GET/PUT /settings/referrals        programa: activo y porcentajes
 *
 *  Plataforma
 *  - GET/PUT /settings/contact          datos de contacto del sitio principal
 *  - GET/PUT /settings/wompi            credenciales Wompi de la plataforma (secretos cifrados, nunca se devuelven)
 *  - POST    /settings/wompi/test       verifica la llave pública contra Wompi
 *  - GET/PUT /settings/nequi            número, titular y QR de Nequi de la plataforma
 *
 *  Pagos por Nequi (con comprobante)
 *  - GET  /payments/:id/proof           imagen del comprobante (privada)
 *  - POST /payments/:id/approve         aprueba y renueva la suscripción
 *  - POST /payments/:id/reject          rechaza con motivo
 *  - GET     /plan-features             catálogo de funcionalidades por plan
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query, withTransaction } from '../db/pool.ts';
import { parseOr400 } from '../lib/validation.ts';
import { config } from '../config.ts';
import { encryptSecret, maskSecret } from '../lib/crypto.ts';
import { getPlatformWompi, keyMatchesEnv } from '../lib/wompi-config.ts';
import { getAcceptanceTokens, newReference } from '../lib/wompi.ts';
import { PLAN_FEATURES } from '../lib/plan-features.ts';
import { quotePrice } from '../lib/pricing.ts';
import { applyApprovedPayment } from '../lib/subscription-billing.ts';
import { nequiSettingsSchema, PROOF_HEADERS, validateNequiSettings } from '../lib/nequi.ts';

const emptyToNull = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v);
const optText = (max: number) => z.preprocess(emptyToNull, z.string().trim().max(max).nullable().optional());
const pct = z.number().min(0).max(90);

const paymentsQuery = z.object({
  status: z.enum(['pending', 'approved', 'declined', 'voided', 'error']).optional(),
  tenantId: z.string().uuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const manualSchema = z.object({
  tenantId: z.string().uuid(),
  planId: z.string().uuid(),
  months: z.union([z.literal(1), z.literal(3), z.literal(6)]),
  /** Si no se envía, se calcula con el precio y descuento del ciclo del plan. */
  amountCop: z.number().int().min(0).optional(),
  notes: optText(300),
});

const referralSettingsSchema = z.object({
  enabled: z.boolean(),
  referralDiscountPct: pct,
  referrerRewardPct: pct,
});

const contactSchema = z.object({
  contactEmail: z.preprocess(emptyToNull, z.string().email().nullable().optional()),
  contactPhone: optText(30),
  contactWhatsapp: z.preprocess(
    (v) => (typeof v === 'string' ? (v.replace(/[^\d]/g, '') || null) : v),
    z.string().min(7).max(15).nullable().optional(),
  ),
  contactAddress: optText(200),
  contactCity: optText(80),
  supportHours: optText(120),
  instagram: optText(100),
  facebook: optText(200),
  tiktok: optText(100),
  website: z.preprocess(emptyToNull, z.string().max(200).regex(/^https?:\/\//i, 'Debe iniciar con http:// o https://').nullable().optional()),
});

/** Un secreto vacío o ausente deja el valor guardado; `clear: true` lo borra. */
const wompiSchema = z.object({
  environment: z.enum(['test', 'prod']),
  publicKey: optText(120),
  privateKey: optText(200),
  integritySecret: optText(200),
  eventsSecret: optText(200),
  clear: z.array(z.enum(['publicKey', 'privateKey', 'integritySecret', 'eventsSecret'])).default([]),
});

export default async function adminCommercialRoutes(app: FastifyInstance): Promise<void> {
  const sa = { preHandler: [app.requireRole('superadmin')] };

  app.get('/plan-features', sa, async () => PLAN_FEATURES);

  // ------------------------------------------------------------------
  // Indicadores de suscripciones y pagos
  // ------------------------------------------------------------------
  app.get('/billing/summary', sa, async () => {
    const totals = await query(
      `SELECT
         COALESCE((SELECT sum(p.price_cop * (1 - (CASE s.billing_cycle_months
                     WHEN 3 THEN p.discount_quarterly_pct WHEN 6 THEN p.discount_semiannual_pct ELSE 0 END) / 100.0))
                    FROM subscriptions s JOIN plans p ON p.id = s.plan_id
                   WHERE s.status = 'active'), 0)::int AS "mrrCop",
         COALESCE((SELECT sum(amount_in_cents) FROM subscription_payments
                   WHERE status='approved' AND updated_at >= date_trunc('month', now())), 0)::bigint / 100 AS "revenueMonthCop",
         COALESCE((SELECT sum(amount_in_cents) FROM subscription_payments
                   WHERE status='approved' AND updated_at >= now() - interval '30 days'), 0)::bigint / 100 AS "revenue30dCop",
         COALESCE((SELECT sum(discount_in_cents) FROM subscription_payments
                   WHERE status='approved' AND updated_at >= date_trunc('month', now())), 0)::bigint / 100 AS "discountsMonthCop",
         (SELECT count(*) FROM subscription_payments WHERE status='pending'
                   AND created_at >= now() - interval '7 days')::int AS "pendingPayments",
         (SELECT count(*) FROM subscription_payments WHERE status IN ('declined','error')
                   AND created_at >= now() - interval '30 days')::int AS "failedPayments30d",
         (SELECT count(*) FROM subscriptions WHERE status='active'
                   AND current_period_end BETWEEN now() AND now() + interval '7 days')::int AS "renewalsNext7d",
         (SELECT count(*) FROM subscriptions WHERE status='trial'
                   AND trial_ends_at BETWEEN now() AND now() + interval '7 days')::int AS "trialsEndingNext7d",
         (SELECT count(*) FROM subscriptions WHERE status='past_due')::int AS "pastDue",
         (SELECT count(*) FROM subscriptions WHERE auto_renew)::int AS "autoRenew",
         (SELECT count(*) FROM referrals WHERE status IN ('converted','rewarded'))::int AS "referralsConverted",
         (SELECT count(*) FROM subscription_payments WHERE provider='nequi' AND status='pending')::int AS "nequiToReview"`,
    );
    const byStatus = await query(`SELECT status, count(*)::int AS n FROM subscriptions GROUP BY status ORDER BY status`);
    const byPlan = await query(
      `SELECT COALESCE(p.name, 'Sin plan') AS plan, count(*)::int AS n
         FROM subscriptions s LEFT JOIN plans p ON p.id = s.plan_id
        WHERE s.status IN ('active','past_due') GROUP BY 1 ORDER BY 2 DESC`,
    );
    const byCycle = await query(
      `SELECT billing_cycle_months AS months, count(*)::int AS n FROM subscriptions
        WHERE status IN ('active','past_due') GROUP BY 1 ORDER BY 1`,
    );
    const monthly = await query(
      `SELECT to_char(m, 'YYYY-MM') AS month,
              COALESCE((SELECT sum(amount_in_cents) FROM subscription_payments
                         WHERE status='approved' AND date_trunc('month', updated_at) = m), 0)::bigint / 100 AS "revenueCop",
              (SELECT count(*) FROM subscription_payments
                WHERE status='approved' AND date_trunc('month', updated_at) = m)::int AS payments
         FROM generate_series(date_trunc('month', now()) - interval '5 months', date_trunc('month', now()), interval '1 month') m
        ORDER BY m`,
    );
    return { ...totals.rows[0], byStatus: byStatus.rows, byPlan: byPlan.rows, byCycle: byCycle.rows, monthly: monthly.rows };
  });

  app.get('/subscriptions', sa, async () => {
    const { rows } = await query(
      `SELECT t.id AS "tenantId", t.name AS "tenantName", t.slug, t.status AS "tenantStatus",
              s.status, s.plan_id AS "planId", p.name AS "planName", p.price_cop AS "priceCop",
              s.billing_cycle_months AS "billingCycleMonths", s.trial_ends_at AS "trialEndsAt",
              s.current_period_end AS "currentPeriodEnd", s.auto_renew AS "autoRenew",
              s.failed_charges AS "failedCharges", s.referral_code AS "referralCode",
              owner.email AS "ownerEmail",
              lp.amount_in_cents / 100 AS "lastPaymentCop", lp.status AS "lastPaymentStatus",
              lp.created_at AS "lastPaymentAt",
              (SELECT COALESCE(sum(amount_in_cents), 0) FROM subscription_payments x
                WHERE x.tenant_id = t.id AND x.status='approved')::bigint / 100 AS "totalPaidCop"
         FROM tenants t
         JOIN subscriptions s ON s.tenant_id = t.id
         LEFT JOIN plans p ON p.id = s.plan_id
         LEFT JOIN LATERAL (SELECT email FROM users u WHERE u.tenant_id = t.id AND u.role='owner'
                             ORDER BY created_at LIMIT 1) owner ON true
         LEFT JOIN LATERAL (SELECT amount_in_cents, status, created_at FROM subscription_payments sp
                             WHERE sp.tenant_id = t.id ORDER BY created_at DESC LIMIT 1) lp ON true
        ORDER BY s.current_period_end NULLS LAST, t.name`,
    );
    return rows;
  });

  app.get('/payments', sa, async (req, reply) => {
    const f = parseOr400(paymentsQuery, req.query, reply);
    if (!f) return;
    const params: unknown[] = [];
    const p = (v: unknown): string => { params.push(v); return `$${params.length}`; };
    const where: string[] = ['true'];
    if (f.status) where.push(`sp.status = ${p(f.status)}`);
    if (f.tenantId) where.push(`sp.tenant_id = ${p(f.tenantId)}`);
    if (f.from) where.push(`sp.created_at >= ${p(f.from)}`);
    if (f.to) where.push(`sp.created_at < ${p(f.to)}`);
    const w = where.join(' AND ');
    const total = await query<{ n: number }>(`SELECT count(*)::int AS n FROM subscription_payments sp WHERE ${w}`, params);
    const { rows } = await query(
      `SELECT sp.id, sp.reference, sp.status, sp.provider, sp.amount_in_cents / 100 AS "amountCop",
              COALESCE(sp.base_amount_in_cents, sp.amount_in_cents) / 100 AS "baseCop",
              sp.discount_in_cents / 100 AS "discountCop", sp.discount_detail AS "discountDetail",
              sp.period_months AS "periodMonths", sp.is_recurring AS "isRecurring",
              sp.wompi_transaction_id AS "wompiTransactionId", sp.notes,
              (sp.proof_id IS NOT NULL) AS "hasProof", sp.payer_note AS "payerNote", sp.review_note AS "reviewNote",
              sp.created_at AS "createdAt", sp.updated_at AS "updatedAt",
              t.id AS "tenantId", t.name AS "tenantName", p.name AS "planName"
         FROM subscription_payments sp
         JOIN tenants t ON t.id = sp.tenant_id
         LEFT JOIN plans p ON p.id = sp.plan_id
        WHERE ${w}
        ORDER BY sp.created_at DESC
        LIMIT ${p(f.limit)} OFFSET ${p(f.offset)}`,
      params,
    );
    return { total: total.rows[0]?.n ?? 0, items: rows };
  });

  app.post('/payments/manual', sa, async (req, reply) => {
    const b = parseOr400(manualSchema, req.body, reply);
    if (!b) return;
    const plan = await query<{ id: string; price_cop: number; discount_quarterly_pct: string; discount_semiannual_pct: string }>(
      `SELECT id, price_cop, discount_quarterly_pct, discount_semiannual_pct FROM plans WHERE id=$1`,
      [b.planId],
    );
    const pl = plan.rows[0];
    if (!pl) return reply.code(404).send({ error: 'Plan no encontrado' });
    const tenant = await query('SELECT 1 FROM subscriptions WHERE tenant_id=$1', [b.tenantId]);
    if (!tenant.rowCount) return reply.code(404).send({ error: 'Negocio no encontrado' });

    const q = quotePrice({
      monthlyPriceCop: pl.price_cop, months: b.months,
      quarterlyPct: Number(pl.discount_quarterly_pct), semiannualPct: Number(pl.discount_semiannual_pct),
    });
    const amountCop = b.amountCop ?? q.totalCop;
    const discountCop = Math.max(0, q.baseCop - amountCop);
    const reference = newReference(b.tenantId, 'man');

    const id = await withTransaction(async (client) => {
      const ins = await client.query<{ id: string }>(
        `INSERT INTO subscription_payments
           (tenant_id, plan_id, reference, amount_in_cents, currency, status, provider, period_months,
            base_amount_in_cents, discount_in_cents, discount_detail, notes, registered_by)
         VALUES ($1,$2,$3,$4,'COP','approved','manual',$5,$6,$7,$8,$9,$10) RETURNING id`,
        [b.tenantId, b.planId, reference, amountCop * 100, b.months, q.baseCop * 100, discountCop * 100,
         JSON.stringify(b.amountCop === undefined ? q.discounts : [{ kind: 'manual', label: 'Ajuste manual', pct: 0, amountCop: discountCop }]),
         b.notes ?? null, req.user.id],
      );
      const paymentId = ins.rows[0]!.id;
      await applyApprovedPayment(client, {
        id: paymentId, tenant_id: b.tenantId, plan_id: b.planId, period_months: b.months,
        referral_id: null, reward_referral_id: null,
      });
      return paymentId;
    });
    return reply.code(201).send({ id, reference, amountCop });
  });

  // ------------------------------------------------------------------
  // Referidos
  // ------------------------------------------------------------------
  app.get('/settings/referrals', sa, async () => {
    const { rows } = await query(
      `SELECT referral_enabled AS enabled, referral_discount_pct::float AS "referralDiscountPct",
              referrer_reward_pct::float AS "referrerRewardPct" FROM platform_settings WHERE id=1`,
    );
    return rows[0];
  });

  app.put('/settings/referrals', sa, async (req, reply) => {
    const b = parseOr400(referralSettingsSchema, req.body, reply);
    if (!b) return;
    await query(
      `UPDATE platform_settings SET referral_enabled=$1, referral_discount_pct=$2, referrer_reward_pct=$3,
              updated_at=now() WHERE id=1`,
      [b.enabled, b.referralDiscountPct, b.referrerRewardPct],
    );
    return { ok: true };
  });

  app.get('/referrals', sa, async () => {
    const { rows } = await query(
      `SELECT r.id, r.code, r.status, r.created_at AS "createdAt", r.updated_at AS "updatedAt",
              r.referred_discount_pct::float AS "discountPct", r.referrer_reward_pct::float AS "rewardPct",
              a.name AS "referrerName", b.name AS "referredName"
         FROM referrals r
         JOIN tenants a ON a.id = r.referrer_tenant_id
         JOIN tenants b ON b.id = r.referred_tenant_id
        ORDER BY r.created_at DESC`,
    );
    return rows;
  });

  app.post('/referrals/:id/void', sa, async (req, reply) => {
    const id = (req.params as { id: string }).id;
    if (!z.string().uuid().safeParse(id).success) return reply.code(404).send({ error: 'No encontrado' });
    const { rowCount } = await query(
      `UPDATE referrals SET status='void', updated_at=now() WHERE id=$1 AND status IN ('pending','converted')`,
      [id],
    );
    if (!rowCount) return reply.code(400).send({ error: 'El referido ya se usó o no existe' });
    return { ok: true };
  });

  // ------------------------------------------------------------------
  // Contacto del sitio principal
  // ------------------------------------------------------------------
  app.get('/settings/contact', sa, async () => {
    const { rows } = await query(
      `SELECT contact_email AS "contactEmail", contact_phone AS "contactPhone",
              contact_whatsapp AS "contactWhatsapp", contact_address AS "contactAddress",
              contact_city AS "contactCity", support_hours AS "supportHours",
              instagram, facebook, tiktok, website
         FROM platform_settings WHERE id=1`,
    );
    return rows[0];
  });

  app.put('/settings/contact', sa, async (req, reply) => {
    const b = parseOr400(contactSchema, req.body, reply);
    if (!b) return;
    await query(
      `UPDATE platform_settings SET contact_email=$1, contact_phone=$2, contact_whatsapp=$3,
              contact_address=$4, contact_city=$5, support_hours=$6, instagram=$7, facebook=$8,
              tiktok=$9, website=$10, updated_at=now() WHERE id=1`,
      [b.contactEmail ?? null, b.contactPhone ?? null, b.contactWhatsapp ?? null, b.contactAddress ?? null,
       b.contactCity ?? null, b.supportHours ?? null, b.instagram ?? null, b.facebook ?? null,
       b.tiktok ?? null, b.website ?? null],
    );
    return { ok: true };
  });

  // ------------------------------------------------------------------
  // Wompi de la plataforma
  // ------------------------------------------------------------------
  app.get('/settings/wompi', sa, async () => {
    const c = await getPlatformWompi();
    return {
      environment: c.environment,
      publicKey: c.publicKey,
      privateKey: maskSecret(c.privateKey),
      integritySecret: maskSecret(c.integritySecret),
      eventsSecret: maskSecret(c.eventsSecret),
      sources: c.sources,
      webhookUrl: `${config.APP_URL.replace(/\/$/, '')}/api/billing/wompi/webhook`,
      ready: { checkout: !!(c.publicKey && c.integritySecret), autoRenew: !!c.privateKey, webhook: !!c.eventsSecret },
    };
  });

  app.put('/settings/wompi', sa, async (req, reply) => {
    const b = parseOr400(wompiSchema, req.body, reply);
    if (!b) return;
    if (b.publicKey && !keyMatchesEnv(b.publicKey, 'pub', b.environment)) {
      return reply.code(400).send({ error: `La llave pública debe empezar por pub_${b.environment}_` });
    }
    if (b.privateKey && !keyMatchesEnv(b.privateKey, 'prv', b.environment)) {
      return reply.code(400).send({ error: `La llave privada debe empezar por prv_${b.environment}_` });
    }
    const k = config.ENCRYPTION_KEY;
    const sets: string[] = ['wompi_environment=$1'];
    const params: unknown[] = [b.environment];
    const add = (col: string, val: string | null) => { params.push(val); sets.push(`${col}=$${params.length}`); };
    if (b.clear.includes('publicKey')) add('wompi_public_key', null); else if (b.publicKey) add('wompi_public_key', b.publicKey);
    if (b.clear.includes('privateKey')) add('wompi_private_key_enc', null); else if (b.privateKey) add('wompi_private_key_enc', encryptSecret(b.privateKey, k));
    if (b.clear.includes('integritySecret')) add('wompi_integrity_enc', null); else if (b.integritySecret) add('wompi_integrity_enc', encryptSecret(b.integritySecret, k));
    if (b.clear.includes('eventsSecret')) add('wompi_events_enc', null); else if (b.eventsSecret) add('wompi_events_enc', encryptSecret(b.eventsSecret, k));
    await query(`UPDATE platform_settings SET ${sets.join(', ')}, updated_at=now() WHERE id=1`, params);
    req.log.info({ by: req.user.id, fields: Object.keys(b).filter((x) => x !== 'clear') }, 'Configuración Wompi de la plataforma actualizada');
    return { ok: true };
  });

  app.post('/settings/wompi/test', sa, async (_req, reply) => {
    const c = await getPlatformWompi();
    if (!c.publicKey) return reply.code(400).send({ error: 'Falta la llave pública' });
    try {
      await getAcceptanceTokens(c);
      return { ok: true, environment: c.environment };
    } catch {
      return reply.code(502).send({ error: 'Wompi no reconoció la llave pública en este ambiente' });
    }
  });

  // ------------------------------------------------------------------
  // Nequi de la plataforma
  // ------------------------------------------------------------------
  app.get('/settings/nequi', sa, async () => {
    const { rows } = await query(
      `SELECT nequi_enabled AS enabled, nequi_number AS number, nequi_holder AS holder, nequi_qr_url AS "qrUrl"
         FROM platform_settings WHERE id=1`,
    );
    return rows[0];
  });

  app.put('/settings/nequi', sa, async (req, reply) => {
    const b = parseOr400(nequiSettingsSchema, req.body, reply);
    if (!b) return;
    const v = validateNequiSettings(b);
    if (!v.ok) return reply.code(400).send({ error: v.error });
    await query(
      `UPDATE platform_settings SET nequi_enabled=$1, nequi_number=$2, nequi_holder=$3, nequi_qr_url=$4, updated_at=now() WHERE id=1`,
      [b.enabled, v.number, b.holder ?? null, b.qrUrl ?? null],
    );
    return { ok: true };
  });

  // ------------------------------------------------------------------
  // Revisión de pagos por Nequi
  // ------------------------------------------------------------------
  const reviewSchema = z.object({ note: z.preprocess((v) => (typeof v === 'string' && !v.trim() ? null : v), z.string().trim().max(200).nullable().optional()) });

  app.get('/payments/:id/proof', sa, async (req, reply) => {
    const id = (req.params as { id: string }).id;
    if (!z.string().uuid().safeParse(id).success) return reply.code(404).send({ error: 'No encontrado' });
    const { rows } = await query<{ mime: string; data: Buffer }>(
      `SELECT pp.mime, pp.data FROM subscription_payments sp JOIN payment_proofs pp ON pp.id = sp.proof_id WHERE sp.id=$1`,
      [id],
    );
    if (!rows[0]) return reply.code(404).send({ error: 'Sin comprobante' });
    return reply.headers({ ...PROOF_HEADERS, 'Content-Type': rows[0].mime }).send(rows[0].data);
  });

  app.post('/payments/:id/approve', sa, async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const b = parseOr400(reviewSchema, req.body ?? {}, reply);
    if (!b) return;
    if (!z.string().uuid().safeParse(id).success) return reply.code(404).send({ error: 'No encontrado' });
    const result = await withTransaction(async (client) => {
      const r = await client.query<{ id: string; tenant_id: string; plan_id: string | null; period_months: number; status: string; provider: string; referral_id: string | null; reward_referral_id: string | null }>(
        `SELECT id, tenant_id, plan_id, period_months, status, provider, referral_id, reward_referral_id
           FROM subscription_payments WHERE id=$1 FOR UPDATE`,
        [id],
      );
      const p = r.rows[0];
      if (!p) return 'not_found';
      if (p.provider !== 'nequi' || p.status !== 'pending') return 'invalid';
      await client.query(
        `UPDATE subscription_payments SET status='approved', reviewed_by=$1, reviewed_at=now(), review_note=$2, updated_at=now() WHERE id=$3`,
        [req.user.id, b.note ?? null, id],
      );
      await applyApprovedPayment(client, p);
      return 'ok';
    });
    if (result === 'not_found') return reply.code(404).send({ error: 'Pago no encontrado' });
    if (result === 'invalid') return reply.code(400).send({ error: 'Solo se aprueban pagos Nequi pendientes' });
    return { ok: true };
  });

  app.post('/payments/:id/reject', sa, async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const b = parseOr400(reviewSchema, req.body ?? {}, reply);
    if (!b) return;
    if (!z.string().uuid().safeParse(id).success) return reply.code(404).send({ error: 'No encontrado' });
    const { rowCount } = await query(
      `UPDATE subscription_payments SET status='declined', reviewed_by=$1, reviewed_at=now(), review_note=$2, updated_at=now()
        WHERE id=$3 AND provider='nequi' AND status='pending'`,
      [req.user.id, b.note ?? 'Comprobante no válido', id],
    );
    if (!rowCount) return reply.code(400).send({ error: 'Solo se rechazan pagos Nequi pendientes' });
    return { ok: true };
  });
}
