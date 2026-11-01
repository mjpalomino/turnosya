/**
 * Origen de las credenciales de Wompi.
 *
 *  - Plataforma (cobro de suscripciones): lo que el superadmin guarde en
 *    platform_settings tiene prioridad; si un campo está vacío se usa la
 *    variable de entorno correspondiente (compatibilidad con despliegues actuales).
 *  - Negocio (cobro de citas en su micrositio): tenant_payment_settings.
 *
 * Los secretos se guardan cifrados con ENCRYPTION_KEY (lib/crypto.ts).
 */
import { query } from '../db/pool.ts';
import { config } from '../config.ts';
import { decryptSecret } from './crypto.ts';
import { envCreds, type WompiCreds } from './wompi.ts';

interface PlatformRow {
  wompi_environment: 'test' | 'prod' | null;
  wompi_public_key: string | null;
  wompi_private_key_enc: string | null;
  wompi_integrity_enc: string | null;
  wompi_events_enc: string | null;
}

export type CredSource = 'panel' | 'env' | 'none';

export async function getPlatformWompi(): Promise<WompiCreds & { sources: Record<keyof Omit<WompiCreds, 'environment'>, CredSource> }> {
  const env = envCreds();
  let row: PlatformRow | undefined;
  try {
    const r = await query<PlatformRow>(
      `SELECT wompi_environment, wompi_public_key, wompi_private_key_enc, wompi_integrity_enc, wompi_events_enc
         FROM platform_settings WHERE id=1`,
    );
    row = r.rows[0];
  } catch {
    row = undefined; // tabla aún sin migrar: solo entorno
  }
  const k = config.ENCRYPTION_KEY;
  const pick = (db: string | null | undefined, envVal: string | null): [string | null, CredSource] =>
    db ? [db, 'panel'] : envVal ? [envVal, 'env'] : [null, 'none'];

  const [publicKey, sPub] = pick(row?.wompi_public_key, env.publicKey);
  const [privateKey, sPriv] = pick(decryptSecret(row?.wompi_private_key_enc, k), env.privateKey);
  const [integritySecret, sInt] = pick(decryptSecret(row?.wompi_integrity_enc, k), env.integritySecret);
  const [eventsSecret, sEv] = pick(decryptSecret(row?.wompi_events_enc, k), env.eventsSecret);

  return {
    environment: row?.wompi_environment ?? env.environment,
    publicKey, privateKey, integritySecret, eventsSecret,
    sources: { publicKey: sPub, privateKey: sPriv, integritySecret: sInt, eventsSecret: sEv },
  };
}

export interface TenantWompi extends WompiCreds {
  enabled: boolean;
  chargeMode: 'full' | 'deposit';
  depositPct: number;
}

export async function getTenantWompi(tenantId: string): Promise<TenantWompi | null> {
  const { rows } = await query<{
    enabled: boolean; wompi_environment: 'test' | 'prod'; wompi_public_key: string | null;
    wompi_integrity_enc: string | null; wompi_events_enc: string | null;
    charge_mode: 'full' | 'deposit'; deposit_pct: number;
  }>(
    `SELECT enabled, wompi_environment, wompi_public_key, wompi_integrity_enc, wompi_events_enc,
            charge_mode, deposit_pct
       FROM tenant_payment_settings WHERE tenant_id=$1`,
    [tenantId],
  );
  const r = rows[0];
  if (!r) return null;
  const k = config.ENCRYPTION_KEY;
  return {
    enabled: r.enabled,
    environment: r.wompi_environment,
    publicKey: r.wompi_public_key,
    privateKey: null, // el cobro de citas usa Web Checkout: no se necesita la llave privada del negocio
    integritySecret: decryptSecret(r.wompi_integrity_enc, k),
    eventsSecret: decryptSecret(r.wompi_events_enc, k),
    chargeMode: r.charge_mode,
    depositPct: r.deposit_pct,
  };
}

/** Un negocio puede cobrar en línea si tiene llave pública y secreto de integridad. */
export function tenantWompiReady(t: TenantWompi | null): t is TenantWompi {
  return !!t && t.enabled && !!t.publicKey && !!t.integritySecret;
}

/** Valida el prefijo de las llaves según el ambiente (pub_test_ / pub_prod_, etc.). */
export function keyMatchesEnv(key: string, kind: 'pub' | 'prv' | 'test_integrity' | 'test_events', env: 'test' | 'prod'): boolean {
  if (kind === 'pub') return key.startsWith(`pub_${env}_`);
  if (kind === 'prv') return key.startsWith(`prv_${env}_`);
  if (kind === 'test_integrity') return key.startsWith(`${env}_integrity_`);
  return key.startsWith(`${env}_events_`);
}
