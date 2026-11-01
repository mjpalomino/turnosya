/**
 * Job de cobro recurrente mensual (Wompi).
 *
 * Busca suscripciones con auto_renew = true cuyo período ya venció (o vence hoy)
 * y que tienen una fuente de pago registrada, y ejecuta un cobro recurrente por
 * el ciclo elegido (1, 3 o 6 meses) con su descuento y, si hay, la recompensa
 * pendiente por referir un negocio. El resultado final llega por el webhook, que renueva el
 * período; aquí solo se dispara el cobro y se registra el intento.
 *
 * Pensado para un cron diario:  node dist/jobs/charge-recurring.js
 *
 * Reglas:
 *  - Solo cobra si current_period_end <= ahora + 1 día (ventana de gracia corta).
 *  - Evita cobrar dos veces el mismo ciclo con last_charge_attempt_at.
 *  - Tras 3 fallos marca la suscripción past_due y detiene el auto-cobro.
 */
import { pool, query } from '../db/pool.ts';
import { chargeRecurring, newReference } from '../lib/wompi.ts';
import { getPlatformWompi } from '../lib/wompi-config.ts';
import { getActivePlan, quoteForTenant } from '../lib/subscription-billing.ts';
import { isBillingCycle } from '../lib/pricing.ts';

const MAX_FAILS = 3;

interface Due {
  tenant_id: string;
  plan_id: string | null;
  price_cop: number | null;
  payment_source_id: string;
  payer_email: string;
  failed_charges: number;
  billing_cycle_months: number;
}

export async function chargeDueSubscriptions(): Promise<{ attempted: number; errors: number }> {
  const creds = await getPlatformWompi();
  if (!creds.privateKey) {
    // eslint-disable-next-line no-console
    console.warn('[charge] Llave privada de Wompi no configurada; nada que cobrar.');
    return { attempted: 0, errors: 0 };
  }

  const { rows } = await query<Due>(
    `SELECT s.tenant_id, s.plan_id, p.price_cop,
            s.wompi_payment_source_id AS payment_source_id,
            s.payer_email, s.failed_charges, s.billing_cycle_months
       FROM subscriptions s
       JOIN plans p ON p.id = s.plan_id
      WHERE s.auto_renew = true
        AND s.wompi_payment_source_id IS NOT NULL
        AND s.payer_email IS NOT NULL
        AND s.status IN ('trial', 'active', 'past_due')
        AND COALESCE(s.current_period_end, now()) <= now() + interval '1 day'
        -- no reintentar si ya se intentó en las últimas 20 horas
        AND (s.last_charge_attempt_at IS NULL
             OR s.last_charge_attempt_at < now() - interval '20 hours')`,
  );

  let attempted = 0;
  let errors = 0;

  for (const r of rows) {
    if (!r.price_cop || r.price_cop <= 0 || !r.plan_id) continue;
    const plan = await getActivePlan(r.plan_id);
    if (!plan) continue; // plan desactivado: no se cobra automáticamente
    const months = isBillingCycle(r.billing_cycle_months) ? r.billing_cycle_months : 1;
    const q = await quoteForTenant(r.tenant_id, plan, months);
    if (q.totalCop <= 0) continue;
    const amountInCents = q.totalCop * 100;
    const reference = newReference(r.tenant_id);

    // Registra el intento y crea el pago pendiente (marca que es recurrente).
    await query('UPDATE subscriptions SET last_charge_attempt_at = now() WHERE tenant_id = $1', [
      r.tenant_id,
    ]);
    await query(
      `INSERT INTO subscription_payments
         (tenant_id, plan_id, reference, amount_in_cents, status, period_months, is_recurring,
          base_amount_in_cents, discount_in_cents, discount_detail, referral_id, reward_referral_id)
       VALUES ($1,$2,$3,$4,'pending',$5,true,$6,$7,$8,$9,$10)`,
      [r.tenant_id, r.plan_id, reference, amountInCents, months, q.baseCop * 100, q.discountCop * 100,
       JSON.stringify(q.discounts), q.referralId, q.rewardReferralId],
    );

    attempted++;
    try {
      const tx = await chargeRecurring({
        paymentSourceId: r.payment_source_id,
        amountInCents,
        reference,
        customerEmail: r.payer_email,
      }, creds);
      // El webhook confirmará APPROVED y renovará. Si Wompi responde DECLINED de
      // inmediato, lo contamos como fallo aquí también.
      if (tx.status === 'DECLINED' || tx.status === 'ERROR') {
        await registerFailure(r.tenant_id, r.failed_charges);
      }
      // eslint-disable-next-line no-console
      console.log(`[charge] tenant ${r.tenant_id}: tx ${tx.id} estado ${tx.status}`);
    } catch (err) {
      errors++;
      await registerFailure(r.tenant_id, r.failed_charges);
      // eslint-disable-next-line no-console
      console.error(`[charge] Error cobrando a ${r.tenant_id}:`, err);
    }
  }

  return { attempted, errors };
}

/** Suma un fallo; tras MAX_FAILS marca past_due y desactiva el auto-cobro. */
async function registerFailure(tenantId: string, current: number): Promise<void> {
  const fails = current + 1;
  if (fails >= MAX_FAILS) {
    await query(
      `UPDATE subscriptions SET failed_charges=$1, status='past_due', auto_renew=false WHERE tenant_id=$2`,
      [fails, tenantId],
    );
  } else {
    await query('UPDATE subscriptions SET failed_charges=$1 WHERE tenant_id=$2', [fails, tenantId]);
  }
}

// Ejecutable directo.
if (import.meta.url === `file://${process.argv[1]}`) {
  chargeDueSubscriptions()
    .then((r) => {
      // eslint-disable-next-line no-console
      console.log(`[charge] ${r.attempted} intento(s), ${r.errors} error(es).`);
    })
    .then(() => pool.end())
    .then(() => process.exit(0))
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error('[charge] Fallo general:', err);
      process.exit(1);
    });
}
