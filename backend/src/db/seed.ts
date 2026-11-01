/**
 * Siembra datos iniciales: el superadmin y dos planes por defecto.
 * Idempotente: usa ON CONFLICT para no duplicar.
 */
import { pool } from './pool.ts';
import { config } from '../config.ts';
import { hashPassword } from '../lib/password.ts';

export async function seed(): Promise<void> {
  // Superadmin
  const existing = await pool.query('SELECT id FROM users WHERE lower(email) = lower($1)', [
    config.USER_ADMIN,
  ]);
  if (existing.rowCount === 0) {
    const hash = await hashPassword(config.PASSWORD_ADMIN);
    await pool.query(
      `INSERT INTO users (tenant_id, role, email, full_name, password_hash)
       VALUES (NULL, 'superadmin', $1, 'Superadministrador', $2)`,
      [config.USER_ADMIN, hash],
    );
    // eslint-disable-next-line no-console
    console.log(`Superadmin creado: ${config.USER_ADMIN}`);
  }

  // Planes por defecto (solo si no hay ninguno)
  const plans = await pool.query('SELECT count(*)::int AS n FROM plans');
  if ((plans.rows[0]?.n ?? 0) === 0) {
    await pool.query(
      `INSERT INTO plans (name, price_cop, max_staff, max_branches, max_services, sort_order, features,
                          description, discount_quarterly_pct, discount_semiannual_pct)
       VALUES
         ('Básico', 49000, 3, 1, 20, 1,
          '{"waitlist": true, "reviews": true, "loyalty": true, "reminders": true, "staff_photos": true,
            "online_payment": false, "reports": false, "featured": false}'::jsonb,
          'Para negocios que empiezan a recibir turnos en línea.', 5, 10),
         ('Pro', 99000, 15, 5, 100, 2,
          '{"waitlist": true, "reviews": true, "loyalty": true, "reminders": true, "staff_photos": true,
            "online_payment": true, "reports": true, "featured": true}'::jsonb,
          'Para equipos y varias sedes, con pagos en línea.', 10, 15)`,
    );
    // eslint-disable-next-line no-console
    console.log('Planes por defecto creados: Básico, Pro');
  }
}
