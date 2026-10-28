/**
 * Fidelización con tarjeta virtual y QR de un solo uso.
 *
 * Flujo seguro (evita trampas):
 *  1. El empleado llama POST /api/loyalty/token -> recibe un token efímero.
 *     El panel lo muestra como QR (el front dibuja el QR con el token dentro).
 *  2. El cliente, ya logueado, escanea y envía POST /api/loyalty/redeem-token
 *     con ese token. El backend valida que no esté usado ni vencido, suma 1
 *     sticker a SU tarjeta y marca el token como usado.
 *  3. Al alcanzar el umbral, POST /api/loyalty/redeem-reward canjea el premio.
 *
 * Endpoints:
 *  - GET  /api/loyalty/settings            (owner) ver reglas
 *  - PUT  /api/loyalty/settings            (owner) editar reglas
 *  - POST /api/loyalty/token               (staff) generar QR de un solo uso
 *  - POST /api/loyalty/redeem-token        (customer) sumar sticker al escanear
 *  - GET  /api/loyalty/card                (customer) ver su tarjeta
 *  - POST /api/loyalty/redeem-reward       (customer) canjear premio
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query, withTransaction } from '../db/pool.ts';
import { parseOr400 } from '../lib/validation.ts';
import { randomToken } from '../lib/token.ts';

const settingsSchema = z.object({
  enabled: z.boolean(),
  stickersForReward: z.number().int().min(1).max(100),
  rewardServiceId: z.string().uuid().nullable().optional(),
  rewardLabel: z.string().min(1).max(100),
  cardExpiryDays: z.number().int().positive().nullable().optional(),
});

const redeemTokenSchema = z.object({ token: z.string().min(10).max(200) });

const TOKEN_TTL_MINUTES = 5;

export default async function loyaltyRoutes(app: FastifyInstance): Promise<void> {
  const owner = { preHandler: [app.requireRole('owner')] };
  const staff = { preHandler: [app.requireRole('staff')] };
  const customer = { preHandler: [app.requireRole('customer')] };

  // --- Reglas (owner) ---
  app.get('/settings', owner, async (req) => {
    const { rows } = await query(
      `SELECT enabled, stickers_for_reward AS "stickersForReward",
              reward_service_id AS "rewardServiceId", reward_label AS "rewardLabel",
              card_expiry_days AS "cardExpiryDays"
       FROM loyalty_settings WHERE tenant_id=$1`,
      [req.user.tenantId],
    );
    return rows[0] ?? null;
  });

  app.put('/settings', owner, async (req, reply) => {
    const body = parseOr400(settingsSchema, req.body, reply);
    if (!body) return;
    await query(
      `UPDATE loyalty_settings
         SET enabled=$1, stickers_for_reward=$2, reward_service_id=$3,
             reward_label=$4, card_expiry_days=$5, updated_at=now()
       WHERE tenant_id=$6`,
      [
        body.enabled,
        body.stickersForReward,
        body.rewardServiceId ?? null,
        body.rewardLabel,
        body.cardExpiryDays ?? null,
        req.user.tenantId,
      ],
    );
    return { ok: true };
  });

  // --- Generar QR de un solo uso (staff) ---
  app.post('/token', staff, async (req, reply) => {
    const { rows: staffRows } = await query<{ id: string }>(
      'SELECT id FROM staff_profiles WHERE user_id=$1',
      [req.user.id],
    );
    const staffId = staffRows[0]?.id;
    if (!staffId) return reply.code(404).send({ error: 'Perfil de empleado no encontrado' });

    const enabled = await query<{ enabled: boolean }>(
      'SELECT enabled FROM loyalty_settings WHERE tenant_id=$1',
      [req.user.tenantId],
    );
    if (!enabled.rows[0]?.enabled) {
      return reply.code(400).send({ error: 'La fidelización no está activa' });
    }

    const token = randomToken();
    await query(
      `INSERT INTO loyalty_tokens (tenant_id, staff_id, token, expires_at)
       VALUES ($1,$2,$3, now() + ($4 || ' minutes')::interval)`,
      [req.user.tenantId, staffId, token, String(TOKEN_TTL_MINUTES)],
    );
    return reply.code(201).send({ token, expiresInMinutes: TOKEN_TTL_MINUTES });
  });

  // --- Escanear y sumar sticker (customer) ---
  app.post('/redeem-token', customer, async (req, reply) => {
    const body = parseOr400(redeemTokenSchema, req.body, reply);
    if (!body) return;
    const tenantId = req.user.tenantId;
    if (!tenantId) return reply.code(400).send({ error: 'Cliente sin negocio' });

    try {
      const out = await withTransaction(async (client) => {
        // bloquea el token para evitar doble uso concurrente
        const tok = await client.query<{ id: string }>(
          `SELECT id FROM loyalty_tokens
            WHERE token=$1 AND tenant_id=$2 AND used_at IS NULL AND expires_at > now()
            FOR UPDATE`,
          [body.token, tenantId],
        );
        if (!tok.rowCount) throw new Error('TOKEN_INVALID');

        await client.query(
          'UPDATE loyalty_tokens SET used_at=now(), used_by=$1 WHERE id=$2',
          [req.user.id, tok.rows[0]!.id],
        );

        // tarjeta (crea si no existe)
        const card = await client.query<{ id: string; stickers: number }>(
          `INSERT INTO loyalty_cards (tenant_id, customer_id, stickers, last_sticker_at)
           VALUES ($1,$2,1, now())
           ON CONFLICT (tenant_id, customer_id)
           DO UPDATE SET stickers = loyalty_cards.stickers + 1, last_sticker_at = now()
           RETURNING id, stickers`,
          [tenantId, req.user.id],
        );
        await client.query(
          `INSERT INTO loyalty_events (card_id, kind) VALUES ($1,'sticker_added')`,
          [card.rows[0]!.id],
        );
        return card.rows[0]!;
      });

      const settings = await query<{ stickers_for_reward: number }>(
        'SELECT stickers_for_reward FROM loyalty_settings WHERE tenant_id=$1',
        [tenantId],
      );
      const threshold = settings.rows[0]?.stickers_for_reward ?? 10;
      return reply.send({
        stickers: out.stickers,
        threshold,
        rewardReady: out.stickers >= threshold,
      });
    } catch (err) {
      if (err instanceof Error && err.message === 'TOKEN_INVALID') {
        return reply.code(400).send({ error: 'QR inválido, usado o vencido' });
      }
      throw err;
    }
  });

  // --- Ver tarjeta (customer) ---
  app.get('/card', customer, async (req, reply) => {
    const tenantId = req.user.tenantId;
    if (!tenantId) return reply.code(400).send({ error: 'Cliente sin negocio' });
    const card = await query<{ stickers: number; rewards_earned: number }>(
      `SELECT stickers, rewards_earned FROM loyalty_cards WHERE tenant_id=$1 AND customer_id=$2`,
      [tenantId, req.user.id],
    );
    const settings = await query<{ stickers_for_reward: number; reward_label: string; enabled: boolean }>(
      'SELECT stickers_for_reward, reward_label, enabled FROM loyalty_settings WHERE tenant_id=$1',
      [tenantId],
    );
    return {
      enabled: settings.rows[0]?.enabled ?? false,
      stickers: card.rows[0]?.stickers ?? 0,
      rewardsEarned: card.rows[0]?.rewards_earned ?? 0,
      threshold: settings.rows[0]?.stickers_for_reward ?? 10,
      rewardLabel: settings.rows[0]?.reward_label ?? 'Servicio gratis',
    };
  });

  // --- Canjear premio (customer) ---
  app.post('/redeem-reward', customer, async (req, reply) => {
    const tenantId = req.user.tenantId;
    if (!tenantId) return reply.code(400).send({ error: 'Cliente sin negocio' });

    const threshold = await query<{ stickers_for_reward: number }>(
      'SELECT stickers_for_reward FROM loyalty_settings WHERE tenant_id=$1',
      [tenantId],
    );
    const need = threshold.rows[0]?.stickers_for_reward ?? 10;

    try {
      const out = await withTransaction(async (client) => {
        const card = await client.query<{ id: string; stickers: number }>(
          `SELECT id, stickers FROM loyalty_cards
            WHERE tenant_id=$1 AND customer_id=$2 FOR UPDATE`,
          [tenantId, req.user.id],
        );
        if (!card.rowCount || card.rows[0]!.stickers < need) throw new Error('NOT_ENOUGH');
        await client.query(
          `UPDATE loyalty_cards
             SET stickers = stickers - $1, rewards_earned = rewards_earned + 1
           WHERE id=$2`,
          [need, card.rows[0]!.id],
        );
        await client.query(
          `INSERT INTO loyalty_events (card_id, kind) VALUES ($1,'reward_redeemed')`,
          [card.rows[0]!.id],
        );
        return card.rows[0]!.stickers - need;
      });
      return reply.send({ ok: true, stickers: out });
    } catch (err) {
      if (err instanceof Error && err.message === 'NOT_ENOUGH') {
        return reply.code(400).send({ error: 'Aún no tienes stickers suficientes' });
      }
      throw err;
    }
  });
}
