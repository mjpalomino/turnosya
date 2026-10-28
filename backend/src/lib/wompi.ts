/**
 * Utilidades de integración con Wompi (Colombia).
 *
 * Dos firmas distintas, no confundir:
 *  - Firma de INTEGRIDAD (checkout): SHA256 de
 *      `${reference}${amountInCents}${currency}${integritySecret}`
 *    Se envía al Widget/Checkout para que Wompi acepte el monto sin manipular.
 *  - Firma de EVENTOS (webhook): SHA256 de
 *      `<valores de signature.properties en orden>` + `timestamp` + `eventsSecret`
 *    Llega en el header X-Event-Checksum y en signature.checksum. Se valida
 *    para confirmar que el evento viene de Wompi.
 *
 * Docs: https://docs.wompi.co/docs/colombia/eventos/
 */
import { createHash } from 'node:crypto';
import { config } from '../config.ts';

/** Firma de integridad para el checkout. */
export function integritySignature(
  reference: string,
  amountInCents: number,
  currency = 'COP',
): string | null {
  const secret = config.PLATFORM_WOMPI_INTEGRITY_SECRET;
  if (!secret) return null;
  const payload = `${reference}${amountInCents}${currency}${secret}`;
  return createHash('sha256').update(payload).digest('hex');
}

/** Lee un campo anidado de un objeto a partir de una ruta "a.b.c". */
function getPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object' && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

export interface WompiEvent {
  event: string;
  data: Record<string, unknown>;
  environment?: string;
  signature?: { properties?: string[]; checksum?: string };
  timestamp?: number;
}

/**
 * Valida la firma de un evento de Wompi.
 * Concatena, EN ORDEN, los valores de signature.properties (leídos de `data`),
 * luego el timestamp, luego el secreto de eventos, y compara el SHA256.
 */
export function verifyEventSignature(body: WompiEvent, headerChecksum?: string): boolean {
  const secret = config.PLATFORM_WOMPI_EVENTS_SECRET;
  if (!secret) return false;
  const props = body.signature?.properties;
  const checksum = headerChecksum || body.signature?.checksum;
  if (!props || !Array.isArray(props) || !checksum || body.timestamp === undefined) return false;

  let concatenated = '';
  for (const prop of props) {
    const value = getPath(body.data, prop);
    if (value === undefined || value === null) return false;
    concatenated += String(value);
  }
  concatenated += String(body.timestamp);
  concatenated += secret;

  const computed = createHash('sha256').update(concatenated).digest('hex');
  // Comparación insensible a mayúsculas; Wompi devuelve hex en mayúsculas.
  return computed.toLowerCase() === checksum.toLowerCase();
}

/** Genera una referencia única para un pago (sin guiones para compatibilidad). */
export function newReference(tenantId: string): string {
  const stamp = Date.now().toString(36);
  const rnd = Math.random().toString(36).slice(2, 8);
  return `sub_${tenantId.replace(/-/g, '').slice(0, 8)}_${stamp}${rnd}`.toUpperCase();
}

// ===================================================================
// Cliente HTTP del API de Wompi (para cobro recurrente, usa la llave privada)
// ===================================================================

/** URL base del API según ambiente. */
export function wompiApiBase(): string {
  return config.PLATFORM_WOMPI_ENVIRONMENT === 'prod'
    ? 'https://production.wompi.co/v1'
    : 'https://sandbox.wompi.co/v1';
}

async function wompiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${wompiApiBase()}${path}`, init);
  const json = (await res.json()) as T & { error?: unknown };
  if (!res.ok) {
    throw new Error(`Wompi ${path} -> ${res.status}: ${JSON.stringify(json)}`);
  }
  return json;
}

interface AcceptanceTokens {
  presigned_acceptance: { acceptance_token: string };
  presigned_personal_data_auth: { acceptance_token: string };
}

/** Obtiene los tokens de aceptación (política de datos) usando la llave pública. */
export async function getAcceptanceTokens(): Promise<{
  acceptanceToken: string;
  personalAuthToken: string;
}> {
  const pub = config.PLATFORM_WOMPI_PUBLIC_KEY;
  if (!pub) throw new Error('Falta PLATFORM_WOMPI_PUBLIC_KEY');
  const data = await wompiFetch<{ data: AcceptanceTokens }>(`/merchants/${pub}`);
  return {
    acceptanceToken: data.data.presigned_acceptance.acceptance_token,
    personalAuthToken: data.data.presigned_personal_data_auth.acceptance_token,
  };
}

/**
 * Crea una fuente de pago (payment source) a partir de un token de tarjeta
 * tokenizada por el widget. Devuelve el id de la fuente para cobrar luego.
 */
export async function createPaymentSource(args: {
  token: string;
  customerEmail: string;
  acceptanceToken: string;
  personalAuthToken: string;
}): Promise<string> {
  const key = config.PLATFORM_WOMPI_PRIVATE_KEY;
  if (!key) throw new Error('Falta PLATFORM_WOMPI_PRIVATE_KEY');
  const data = await wompiFetch<{ data: { id: number } }>(`/payment_sources`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      type: 'CARD',
      token: args.token,
      customer_email: args.customerEmail,
      acceptance_token: args.acceptanceToken,
      accept_personal_auth: args.personalAuthToken,
    }),
  });
  return String(data.data.id);
}

/**
 * Crea una transacción recurrente contra una fuente de pago existente.
 * Devuelve el id y estado de la transacción. El resultado final llega también
 * por el webhook (transaction.updated), que es quien renueva la suscripción.
 */
export async function chargeRecurring(args: {
  paymentSourceId: string;
  amountInCents: number;
  reference: string;
  customerEmail: string;
}): Promise<{ id: string; status: string }> {
  const key = config.PLATFORM_WOMPI_PRIVATE_KEY;
  if (!key) throw new Error('Falta PLATFORM_WOMPI_PRIVATE_KEY');
  const signature = integritySignature(args.reference, args.amountInCents, 'COP');
  const data = await wompiFetch<{ data: { id: string; status: string } }>(`/transactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      amount_in_cents: args.amountInCents,
      currency: 'COP',
      customer_email: args.customerEmail,
      reference: args.reference,
      payment_source_id: Number(args.paymentSourceId),
      recurrent: true,
      ...(signature ? { signature } : {}),
    }),
  });
  return { id: String(data.data.id), status: data.data.status };
}

/**
 * Tokeniza una tarjeta con la llave pública. Útil para pruebas server-side en
 * Sandbox. En producción la tokenización ocurre en el navegador con el widget,
 * nunca enviando el PAN por tu servidor.
 */
export async function tokenizeCard(card: {
  number: string;
  cvc: string;
  expMonth: string;
  expYear: string;
  cardHolder: string;
}): Promise<string> {
  const pub = config.PLATFORM_WOMPI_PUBLIC_KEY;
  if (!pub) throw new Error('Falta PLATFORM_WOMPI_PUBLIC_KEY');
  const data = await wompiFetch<{ data: { id: string } }>(`/tokens/cards`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pub}` },
    body: JSON.stringify({
      number: card.number,
      cvc: card.cvc,
      exp_month: card.expMonth,
      exp_year: card.expYear,
      card_holder: card.cardHolder,
    }),
  });
  return data.data.id;
}

/** Consulta el estado actual de una transacción por su id. */
export async function getTransaction(id: string): Promise<{ id: string; status: string }> {
  const data = await wompiFetch<{ data: { id: string; status: string } }>(`/transactions/${id}`);
  return { id: String(data.data.id), status: data.data.status };
}
