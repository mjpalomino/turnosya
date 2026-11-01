/**
 * Cálculo del valor de una suscripción (funciones puras, sin BD).
 *
 * Orden de los descuentos (se aplican en cascada sobre el valor restante):
 *   1. Descuento por ciclo (trimestral o semestral) definido en el plan.
 *   2. Descuento por código de referido (primer pago del negocio referido).
 *   3. Recompensa por referir (crédito de quien refirió, en su siguiente pago).
 * El total nunca baja de 0 y se redondea a pesos enteros.
 */

export type BillingCycle = 1 | 3 | 6;

export const CYCLE_LABELS: Record<BillingCycle, string> = {
  1: 'Mensual',
  3: 'Trimestral',
  6: 'Semestral',
};

export interface PriceInput {
  monthlyPriceCop: number;
  months: BillingCycle;
  quarterlyPct?: number;
  semiannualPct?: number;
  referralPct?: number;   // negocio referido, primer pago
  rewardPct?: number;     // quien refirió
}

export interface DiscountLine {
  kind: 'cycle' | 'referral' | 'referrer_reward';
  label: string;
  pct: number;
  amountCop: number;
}

export interface PriceQuote {
  months: BillingCycle;
  monthlyPriceCop: number;
  baseCop: number;
  discounts: DiscountLine[];
  discountCop: number;
  totalCop: number;
  /** Valor mensual equivalente después de descuentos (informativo). */
  effectiveMonthlyCop: number;
}

const clampPct = (p: number | undefined): number => Math.min(Math.max(Number(p) || 0, 0), 100);

export function cyclePct(months: BillingCycle, quarterlyPct = 0, semiannualPct = 0): number {
  if (months === 3) return clampPct(quarterlyPct);
  if (months === 6) return clampPct(semiannualPct);
  return 0;
}

export function quotePrice(input: PriceInput): PriceQuote {
  const base = Math.max(0, Math.round(input.monthlyPriceCop * input.months));
  let remaining = base;
  const discounts: DiscountLine[] = [];

  const apply = (kind: DiscountLine['kind'], label: string, pct: number): void => {
    const p = clampPct(pct);
    if (p <= 0 || remaining <= 0) return;
    const amount = Math.round((remaining * p) / 100);
    if (amount <= 0) return;
    remaining -= amount;
    discounts.push({ kind, label, pct: p, amountCop: amount });
  };

  apply('cycle', `Descuento ${CYCLE_LABELS[input.months].toLowerCase()}`,
    cyclePct(input.months, input.quarterlyPct, input.semiannualPct));
  apply('referral', 'Descuento por código de referido', input.referralPct ?? 0);
  apply('referrer_reward', 'Recompensa por referir un negocio', input.rewardPct ?? 0);

  const total = Math.max(0, remaining);
  return {
    months: input.months,
    monthlyPriceCop: input.monthlyPriceCop,
    baseCop: base,
    discounts,
    discountCop: base - total,
    totalCop: total,
    effectiveMonthlyCop: Math.round(total / input.months),
  };
}

export function isBillingCycle(n: unknown): n is BillingCycle {
  return n === 1 || n === 3 || n === 6;
}

/** Código de referido legible: 8 caracteres sin 0/O/1/I. */
export function newReferralCode(rand: () => number = Math.random): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 8; i++) out += alphabet[Math.floor(rand() * alphabet.length)];
  return out;
}

export function normalizeReferralCode(code: string): string {
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}
