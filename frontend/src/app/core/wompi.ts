/** Redirección al Web Checkout de Wompi con los parámetros firmados por el backend. */
import type { WompiCheckout } from './models';

export function wompiCheckoutUrl(c: WompiCheckout): string {
  const params = new URLSearchParams({
    'public-key': c.publicKey,
    currency: c.currency,
    'amount-in-cents': String(c.amountInCents),
    reference: c.reference,
    'redirect-url': c.redirectUrl,
  });
  if (c.signatureIntegrity) params.set('signature:integrity', c.signatureIntegrity);
  if (c.customerEmail) params.set('customer-data:email', c.customerEmail);
  return `https://checkout.wompi.co/p/?${params.toString()}`;
}

export function goToWompi(c: WompiCheckout): void {
  window.location.href = wompiCheckoutUrl(c);
}

/** Etiqueta en español del estado de un pago. */
export function paymentStatusLabel(s: string): string {
  return ({ pending: 'Pendiente', approved: 'Aprobado', declined: 'Rechazado', voided: 'Anulado', error: 'Error' } as Record<string, string>)[s] ?? s;
}

export function paymentBadge(s: string): string {
  return s === 'approved' ? 'badge-ok' : s === 'pending' ? 'badge-warn' : 'badge-danger';
}

export function subStatusLabel(s: string | null | undefined): string {
  return ({ trial: 'Prueba gratis', active: 'Activa', past_due: 'Pago vencido', cancelled: 'Cancelada' } as Record<string, string>)[s ?? ''] ?? (s ?? '—');
}

export function cycleLabel(m: number | null | undefined): string {
  return ({ 1: 'Mensual', 3: 'Trimestral', 6: 'Semestral' } as Record<number, string>)[m ?? 1] ?? `${m} meses`;
}
