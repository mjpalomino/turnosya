/**
 * Job de cobro recurrente mensual (Wompi).
 *
 * Busca suscripciones con auto_renew = true cuyo período ya venció (o vence hoy)
 * y que tienen una fuente de pago registrada, y ejecuta un cobro recurrente por
 * el precio del plan. El resultado final llega por el webhook, que renueva el
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
import { config } from '../config.ts';

const MAX_FAILS = 3;

interface Due {
  tenant_id: string;
  plan_id: string | null;
  price_cop: number | null;
  payment_source_id: string;
  payer_email: string;
  failed_charges: number;
}

export async function chargeDueSubscriptions(): Promise<{ attempted: number; errors: number }> {
  if (!config.PLATFORM_WOMPI_PRIVATE_KEY) {
    // eslint-disable-next-line no-console
    console.warn('[charge] PLATFORM_WOMPI_PRIVATE_KEY no configurada; nada que cobrar.');
    return { attempted: 0, errors: 0 };
  }

  const { rows } = await query<Due>(
    `SELECT s.tenant_id, s.plan_id, p.price_cop,
            s.wompi_payment_source_id AS payment_source_id,
            s.payer_email, s.failed_charges
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
    if (!r.price_cop || r.price_cop <= 0) continue;
    const amountInCents = r.price_cop * 100;
    const reference = newReference(r.tenant_id);

    // Registra el intento y crea el pago pendiente (marca que es recurrente).
    await query('UPDATE subscriptions SET last_charge_attempt_at = now() WHERE tenant_id = $1', [
      r.tenant_id,
    ]);
    await query(
      `INSERT INTO subscription_payments
         (tenant_id, plan_id, reference, amount_in_cents, status, period_months, is_recurring)
       VALUES ($1,$2,$3,$4,'pending',1,true)`,
      [r.tenant_id, r.plan_id, reference, amountInCents],
    );

    attempted++;
    try {
      const tx = await chargeRecurring({
        paymentSourceId: r.payment_source_id,
        amountInCents,
        reference,
        customerEmail: r.payer_email,
      });
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
