/**
 * Lógica compartida del cobro de suscripciones:
 *  - cotización con descuentos (ciclo, referido, recompensa por referir),
 *  - validación y registro de códigos de referido,
 *  - aplicación de un pago aprobado (Wompi o manual) sobre la suscripción.
 */
import type pg from 'pg';
import { query } from '../db/pool.ts';
import { normalizeReferralCode, quotePrice, type BillingCycle, type PriceQuote } from './pricing.ts';

export interface ReferralSettings {
  enabled: boolean;
  referralDiscountPct: number;
  referrerRewardPct: number;
}

export async function getReferralSettings(): Promise<ReferralSettings> {
  const { rows } = await query<{ referral_enabled: boolean; referral_discount_pct: string; referrer_reward_pct: string }>(
    `SELECT referral_enabled, referral_discount_pct, referrer_reward_pct FROM platform_settings WHERE id=1`,
  );
  const r = rows[0];
  return {
    enabled: r?.referral_enabled ?? false,
    referralDiscountPct: Number(r?.referral_discount_pct ?? 0),
    referrerRewardPct: Number(r?.referrer_reward_pct ?? 0),
  };
}

export interface PlanPricing {
  id: string;
  name: string;
  price_cop: number;
  discount_quarterly_pct: string;
  discount_semiannual_pct: string;
}

export async function getActivePlan(planId: string): Promise<PlanPricing | null> {
  const { rows } = await query<PlanPricing>(
    `SELECT id, name, price_cop, discount_quarterly_pct, discount_semiannual_pct
       FROM plans WHERE id=$1 AND is_active=true`,
    [planId],
  );
  return rows[0] ?? null;
}

export interface TenantQuote extends PriceQuote {
  planId: string;
  planName: string;
  referralId: string | null;
  rewardReferralId: string | null;
}

/**
 * Cotiza el próximo pago de un negocio.
 *  - El descuento por referido solo aplica mientras el negocio no tenga pagos aprobados.
 *  - La recompensa por referir toma la más antigua disponible (una por pago).
 */
export async function quoteForTenant(tenantId: string, plan: PlanPricing, months: BillingCycle): Promise<TenantQuote> {
  const ref = await query<{ id: string; referred_discount_pct: string }>(
    `SELECT r.id, r.referred_discount_pct
       FROM referrals r
      WHERE r.referred_tenant_id=$1 AND r.status='pending'
        AND NOT EXISTS (SELECT 1 FROM subscription_payments p WHERE p.tenant_id=$1 AND p.status='approved')`,
    [tenantId],
  );
  const reward = await query<{ id: string; referrer_reward_pct: string }>(
    `SELECT id, referrer_reward_pct FROM referrals
      WHERE referrer_tenant_id=$1 AND status='converted'
      ORDER BY updated_at, created_at LIMIT 1`,
    [tenantId],
  );
  const referral = ref.rows[0];
  const rw = reward.rows[0];
  const q = quotePrice({
    monthlyPriceCop: plan.price_cop,
    months,
    quarterlyPct: Number(plan.discount_quarterly_pct),
    semiannualPct: Number(plan.discount_semiannual_pct),
    referralPct: referral ? Number(referral.referred_discount_pct) : 0,
    rewardPct: rw ? Number(rw.referrer_reward_pct) : 0,
  });
  return {
    ...q,
    planId: plan.id,
    planName: plan.name,
    referralId: referral && q.discounts.some((d) => d.kind === 'referral') ? referral.id : null,
    rewardReferralId: rw && q.discounts.some((d) => d.kind === 'referrer_reward') ? rw.id : null,
  };
}

export type ReferralCheck =
  | { ok: true; referrerTenantId: string; referrerName: string; settings: ReferralSettings }
  | { ok: false; error: string };

/** Valida un código: existe, el programa está activo y quien refiere tiene suscripción activa. */
export async function checkReferralCode(rawCode: string, forTenantId?: string): Promise<ReferralCheck> {
  const settings = await getReferralSettings();
  if (!settings.enabled) return { ok: false, error: 'El programa de referidos no está activo' };
  const code = normalizeReferralCode(rawCode);
  if (code.length < 6) return { ok: false, error: 'Código de referido inválido' };
  const { rows } = await query<{ tenant_id: string; status: string; tenant_status: string; name: string }>(
    `SELECT s.tenant_id, s.status, t.status AS tenant_status, t.name
       FROM subscriptions s JOIN tenants t ON t.id = s.tenant_id
      WHERE s.referral_code=$1`,
    [code],
  );
  const r = rows[0];
  if (!r) return { ok: false, error: 'Código de referido no encontrado' };
  if (forTenantId && r.tenant_id === forTenantId) return { ok: false, error: 'No puedes usar tu propio código' };
  if (r.status !== 'active' || r.tenant_status !== 'active') {
    return { ok: false, error: 'Ese código pertenece a un negocio sin suscripción activa' };
  }
  return { ok: true, referrerTenantId: r.tenant_id, referrerName: r.name, settings };
}

/** Registra el referido de un negocio nuevo (dentro de una transacción o fuera de ella). */
/** Cualquier objeto con query(texto, params): un PoolClient de una transacción o el pool. */
export interface Queryable { query: (text: string, params?: unknown[]) => Promise<unknown> }

export async function attachReferral(
  db: Queryable,
  referredTenantId: string,
  rawCode: string,
  check: Extract<ReferralCheck, { ok: true }>,
): Promise<void> {
  await db.query(
    `INSERT INTO referrals (referrer_tenant_id, referred_tenant_id, code, referred_discount_pct, referrer_reward_pct)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (referred_tenant_id) DO NOTHING`,
    [check.referrerTenantId, referredTenantId, normalizeReferralCode(rawCode),
     check.settings.referralDiscountPct, check.settings.referrerRewardPct],
  );
}

/**
 * Aplica un pago aprobado: renueva el período por los meses pagados, fija plan y
 * ciclo, y actualiza los referidos asociados. Debe llamarse dentro de una
 * transacción y una sola vez por pago (el llamador garantiza la idempotencia).
 */
export async function applyApprovedPayment(
  client: Pick<pg.PoolClient, 'query'>,
  p: { id: string; tenant_id: string; plan_id: string | null; period_months: number; referral_id: string | null; reward_referral_id: string | null },
): Promise<void> {
  const cycle = [1, 3, 6].includes(p.period_months) ? p.period_months : 1;
  await client.query(
    `UPDATE subscriptions
        SET plan_id = COALESCE($1, plan_id),
            status = 'active',
            billing_cycle_months = $2,
            current_period_end = GREATEST(COALESCE(current_period_end, now()), now())
                                 + ($3 || ' months')::interval,
            failed_charges = 0,
            updated_at = now()
      WHERE tenant_id = $4`,
    [p.plan_id, cycle, String(p.period_months), p.tenant_id],
  );
  if (p.referral_id) {
    await client.query(
      `UPDATE referrals SET status='converted', converted_payment_id=$1, updated_at=now()
        WHERE id=$2 AND status='pending'`,
      [p.id, p.referral_id],
    );
  }
  if (p.reward_referral_id) {
    await client.query(
      `UPDATE referrals SET status='rewarded', reward_payment_id=$1, updated_at=now()
        WHERE id=$2 AND status='converted'`,
      [p.id, p.reward_referral_id],
    );
  }
}

/** Crea un código de referido único para una suscripción que no tenga. */
export async function ensureReferralCode(tenantId: string, gen: () => string): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const code = gen();
    try {
      const { rows } = await query<{ referral_code: string }>(
        `UPDATE subscriptions SET referral_code = COALESCE(referral_code, $1)
          WHERE tenant_id=$2 RETURNING referral_code`,
        [code, tenantId],
      );
      if (rows[0]) return rows[0].referral_code;
      throw new Error('Suscripción no encontrada');
    } catch (err) {
      if ((err as { code?: string }).code !== '23505') throw err;
    }
  }
  throw new Error('No se pudo generar el código de referido');
}
