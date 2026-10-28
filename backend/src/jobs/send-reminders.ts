/**
 * Job de recordatorios. Envía un correo de recordatorio para las citas que
 * empiezan dentro de la ventana [ahora, ahora + REMINDER_LEAD_MINUTES] y que
 * todavía no tienen recordatorio enviado.
 *
 * Pensado para ejecutarse periódicamente (cron de Coolify, cada 15-30 min):
 *   node dist/jobs/send-reminders.js
 *
 * Marca `reminder_sent_at` para no reenviar. Es seguro ejecutarlo seguido.
 */
import { pool, query } from '../db/pool.ts';
import { notifyAppointment } from '../lib/notify.ts';

const LEAD_MINUTES = Number(process.env.REMINDER_LEAD_MINUTES ?? 120);

export async function sendDueReminders(): Promise<number> {
  const { rows } = await query<{ id: string }>(
    `SELECT id FROM appointments
      WHERE status IN ('booked', 'confirmed')
        AND reminder_sent_at IS NULL
        AND customer_email IS NOT NULL
        AND starts_at > now()
        AND starts_at <= now() + ($1 || ' minutes')::interval`,
    [String(LEAD_MINUTES)],
  );

  let sent = 0;
  for (const { id } of rows) {
    await notifyAppointment(id, 'reminder');
    await query('UPDATE appointments SET reminder_sent_at = now() WHERE id = $1', [id]);
    sent++;
  }
  return sent;
}

// Ejecutable directo.
if (import.meta.url === `file://${process.argv[1]}`) {
  sendDueReminders()
    .then((n) => {
      // eslint-disable-next-line no-console
      console.log(`[reminders] ${n} recordatorio(s) enviado(s).`);
    })
    .then(() => pool.end())
    .then(() => process.exit(0))
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error('[reminders] Error:', err);
      process.exit(1);
    });
}
