/**
 * Cobro de suscripción con Wompi.
 *
 *  - POST /api/billing/checkout        (owner) crea un pago pendiente y
 *        devuelve los datos para abrir el Widget/Checkout de Wompi, con la
 *        firma de integridad ya calculada.
 *  - POST /api/billing/wompi/webhook   (público) recibe transaction.updated.
 *        Valida la firma del evento; si APPROVED, activa/renueva 1 mes.
 *  - GET  /api/billing/payments        (owner) historial de pagos del negocio.
 *
 * Flujo del lado del front:
 *   1. El dueño elige un plan y llama /checkout.
 *   2. Con la respuesta abre el Widget de Wompi (public key + reference +
 *      amount-in-cents + currency + signature:integrity).
 *   3. Wompi cobra y notifica al webhook, que renueva la suscripción.
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

const checkoutSchema = z.object({
  planId: z.string().uuid(),
  periodMonths: z.number().int().min(1).max(12).default(1),
});

const autoPaySchema = z.object({
  cardToken: z.string().min(5),
  payerEmail: z.string().email(),
  planId: z.string().uuid(),
});

/** Mapea el estado de Wompi al estado local de pago. */
function mapStatus(wompi: string): 'approved' | 'declined' | 'voided' | 'error' | 'pending' {
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

  // --- Crear checkout ---
  app.post('/checkout', owner, async (req, reply) => {
    if (!config.PLATFORM_WOMPI_PUBLIC_KEY || !config.PLATFORM_WOMPI_INTEGRITY_SECRET) {
      return reply.code(503).send({ error: 'El pago en línea no está configurado' });
    }
    const body = parseOr400(checkoutSchema, req.body, reply);
    if (!body) return;

    const plan = await query<{ price_cop: number }>(
      'SELECT price_cop FROM plans WHERE id=$1 AND is_active=true',
      [body.planId],
    );
    if (!plan.rowCount) return reply.code(404).send({ error: 'Plan no encontrado' });

    const amountInCents = plan.rows[0]!.price_cop * body.periodMonths * 100;
    const reference = newReference(req.user.tenantId!);

    await query(
      `INSERT INTO subscription_payments
         (tenant_id, plan_id, reference, amount_in_cents, currency, status, period_months)
       VALUES ($1,$2,$3,$4,'COP','pending',$5)`,
      [req.user.tenantId, body.planId, reference, amountInCents, body.periodMonths],
    );

    const signature = integritySignature(reference, amountInCents, 'COP');
    return reply.send({
      publicKey: config.PLATFORM_WOMPI_PUBLIC_KEY,
      currency: 'COP',
      amountInCents,
      reference,
      signatureIntegrity: signature,
      redirectUrl: `${config.APP_URL}/panel`,
    });
  });

  // --- Webhook de Wompi ---
  // Público: no lleva JWT. La autenticidad se valida con la firma del evento.
  app.post('/wompi/webhook', async (req, reply) => {
    const body = req.body as WompiEvent;
    const headerChecksum = req.headers['x-event-checksum'] as string | undefined;

    if (!body?.event || !verifyEventSignature(body, headerChecksum)) {
      // Firma inválida: ignorar (pero responder 200 evitaría reintentos; 401 es correcto aquí).
      return reply.code(401).send({ error: 'Firma inválida' });
    }

    if (body.event !== 'transaction.updated') {
      return reply.code(200).send({ ok: true }); // otros eventos: aceptar sin actuar
    }

    const tx = (body.data as { transaction?: Record<string, unknown> }).transaction;
    if (!tx) return reply.code(200).send({ ok: true });

    const reference = String(tx['reference'] ?? '');
    const wompiStatus = String(tx['status'] ?? '');
    const wompiId = String(tx['id'] ?? '');
    const localStatus = mapStatus(wompiStatus);

    await withTransaction(async (client) => {
      const pay = await client.query<{
        id: string; tenant_id: string; plan_id: string | null; period_months: number; status: string;
      }>(
        `SELECT id, tenant_id, plan_id, period_months, status
           FROM subscription_payments WHERE reference=$1 FOR UPDATE`,
        [reference],
      );
      if (!pay.rowCount) return; // referencia desconocida: nada que hacer

      const p = pay.rows[0]!;
      // Idempotencia: si ya está aprobado, no renovar dos veces.
      if (p.status === 'approved') return;

      await client.query(
        `UPDATE subscription_payments SET status=$1, wompi_transaction_id=$2, updated_at=now() WHERE id=$3`,
        [localStatus, wompiId, p.id],
      );

      if (localStatus === 'approved') {
        // Renueva: extiende el período desde el mayor entre ahora y el vencimiento actual.
        await client.query(
          `UPDATE subscriptions
             SET plan_id = COALESCE($1, plan_id),
                 status = 'active',
                 current_period_end = GREATEST(COALESCE(current_period_end, now()), now())
                                      + ($2 || ' months')::interval,
                 failed_charges = 0,
                 updated_at = now()
           WHERE tenant_id = $3`,
          [p.plan_id, String(p.period_months), p.tenant_id],
        );
      }
    });

    return reply.code(200).send({ ok: true });
  });

  // --- Tokens de aceptación para el widget de tokenización de tarjeta ---
  app.get('/acceptance', owner, async (_req, reply) => {
    if (!config.PLATFORM_WOMPI_PUBLIC_KEY) {
      return reply.code(503).send({ error: 'El pago en línea no está configurado' });
    }
    try {
      const tokens = await getAcceptanceTokens();
      return reply.send({ publicKey: config.PLATFORM_WOMPI_PUBLIC_KEY, ...tokens });
    } catch {
      return reply.code(502).send({ error: 'No se pudo contactar a Wompi' });
    }
  });

  // --- Activar auto-renovación: registra la fuente de pago tokenizada ---
  app.post('/auto-renew', owner, async (req, reply) => {
    if (!config.PLATFORM_WOMPI_PRIVATE_KEY) {
      return reply.code(503).send({ error: 'El cobro automático no está configurado' });
    }
    const body = parseOr400(autoPaySchema, req.body, reply);
    if (!body) return;

    const plan = await query('SELECT 1 FROM plans WHERE id=$1 AND is_active=true', [body.planId]);
    if (!plan.rowCount) return reply.code(404).send({ error: 'Plan no encontrado' });

    try {
      const tokens = await getAcceptanceTokens();
      const sourceId = await createPaymentSource({
        token: body.cardToken,
        customerEmail: body.payerEmail,
        acceptanceToken: tokens.acceptanceToken,
        personalAuthToken: tokens.personalAuthToken,
      });
      await query(
        `UPDATE subscriptions
            SET wompi_payment_source_id=$1, payer_email=$2, auto_renew=true,
                plan_id=$3, failed_charges=0, updated_at=now()
          WHERE tenant_id=$4`,
        [sourceId, body.payerEmail, body.planId, req.user.tenantId],
      );
      return reply.send({ ok: true, autoRenew: true });
    } catch {
      return reply.code(502).send({ error: 'No se pudo registrar la tarjeta en Wompi' });
    }
  });

  // --- Desactivar auto-renovación ---
  app.post('/auto-renew/cancel', owner, async (req) => {
    await query(
      `UPDATE subscriptions SET auto_renew=false, updated_at=now() WHERE tenant_id=$1`,
      [req.user.tenantId],
    );
    return { ok: true, autoRenew: false };
  });

  // --- Estado de la suscripción (incluye si tiene auto-cobro) ---
  app.get('/subscription', owner, async (req) => {
    const { rows } = await query(
      `SELECT status, trial_ends_at AS "trialEndsAt", current_period_end AS "currentPeriodEnd",
              auto_renew AS "autoRenew", payer_email AS "payerEmail",
              (wompi_payment_source_id IS NOT NULL) AS "hasCard"
       FROM subscriptions WHERE tenant_id=$1`,
      [req.user.tenantId],
    );
    return rows[0] ?? null;
  });

  // --- Historial de pagos ---
  app.get('/payments', owner, async (req) => {
    const { rows } = await query(
      `SELECT reference, amount_in_cents AS "amountInCents", currency, status,
              period_months AS "periodMonths", created_at AS "createdAt"
       FROM subscription_payments WHERE tenant_id=$1 ORDER BY created_at DESC`,
      [req.user.tenantId],
    );
    return rows;
  });
}
