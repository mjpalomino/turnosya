/**
 * Catálogo de funcionalidades que se pueden activar por plan y reglas de
 * acceso según la suscripción del negocio.
 *
 * Reglas:
 *  - Durante la prueba gratis (trial) el negocio tiene todas las funcionalidades
 *    y los límites del plan asignado (sin plan: sin límites), para que pueda probarlo todo.
 *  - Con suscripción activa o vencida (past_due) aplica lo que define su plan.
 *  - Una funcionalidad que no aparece en el plan se considera desactivada.
 */
import { query } from '../db/pool.ts';

export const PLAN_FEATURES = [
  { key: 'waitlist', label: 'Lista de espera' },
  { key: 'reviews', label: 'Reseñas y calificaciones' },
  { key: 'loyalty', label: 'Fidelización con QR' },
  { key: 'reminders', label: 'Recordatorios por correo' },
  { key: 'staff_photos', label: 'Fotos del equipo en el micrositio' },
  { key: 'online_payment', label: 'Pagos en línea de citas (Wompi)' },
  { key: 'reports', label: 'Reportes avanzados' },
  { key: 'featured', label: 'Destacado en el directorio' },
] as const;

export type FeatureKey = (typeof PLAN_FEATURES)[number]['key'];

export const FEATURE_KEYS: FeatureKey[] = PLAN_FEATURES.map((f) => f.key);

export interface Entitlements {
  status: string;
  planId: string | null;
  planName: string | null;
  isTrial: boolean;
  features: Record<FeatureKey, boolean>;
  limits: { maxStaff: number | null; maxServices: number | null; maxBranches: number | null };
}

/** Resuelve funcionalidades y límites a partir de la fila del plan (función pura). */
export function resolveEntitlements(row: {
  status: string | null;
  plan_id: string | null;
  plan_name: string | null;
  features: Record<string, unknown> | null;
  max_staff: number | null;
  max_services: number | null;
  max_branches: number | null;
}): Entitlements {
  const status = row.status ?? 'trial';
  const isTrial = status === 'trial';
  const features = {} as Record<FeatureKey, boolean>;
  for (const k of FEATURE_KEYS) features[k] = isTrial ? true : row.features?.[k] === true;
  return {
    status,
    planId: row.plan_id,
    planName: row.plan_name,
    isTrial,
    features,
    limits: {
      maxStaff: row.plan_id ? row.max_staff : null,
      maxServices: row.plan_id ? row.max_services : null,
      maxBranches: row.plan_id ? row.max_branches : null,
    },
  };
}

export async function getEntitlements(tenantId: string): Promise<Entitlements> {
  const { rows } = await query<{
    status: string | null; plan_id: string | null; plan_name: string | null;
    features: Record<string, unknown> | null; max_staff: number | null;
    max_services: number | null; max_branches: number | null;
  }>(
    `SELECT s.status, s.plan_id, p.name AS plan_name, p.features,
            p.max_staff, p.max_services, p.max_branches
       FROM tenants t
       LEFT JOIN subscriptions s ON s.tenant_id = t.id
       LEFT JOIN plans p ON p.id = s.plan_id
      WHERE t.id = $1`,
    [tenantId],
  );
  return resolveEntitlements(rows[0] ?? {
    status: 'trial', plan_id: null, plan_name: null, features: null,
    max_staff: null, max_services: null, max_branches: null,
  });
}

/** Normaliza el objeto de funcionalidades que envía el superadmin. */
export function sanitizeFeatures(input: Record<string, unknown>): Record<FeatureKey, boolean> {
  const out = {} as Record<FeatureKey, boolean>;
  for (const k of FEATURE_KEYS) out[k] = input[k] === true;
  return out;
}

export function featureLabel(key: FeatureKey): string {
  return PLAN_FEATURES.find((f) => f.key === key)?.label ?? key;
}
