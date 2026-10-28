/**
 * Notificaciones de cita por correo. Reúne los datos del negocio y del cliente,
 * formatea la fecha en la zona horaria del negocio y envía el correo adecuado.
 *
 * Es "fire and forget": se invoca sin await desde las rutas para no bloquear la
 * respuesta, y cualquier error solo se loguea.
 */
import { query } from '../db/pool.ts';
import { sendMail } from './mailer.ts';
import {
  bookedEmail,
  cancelledEmail,
  reminderEmail,
  type AppointmentEmailData,
} from './email-templates.ts';

type Kind = 'booked' | 'cancelled' | 'reminder';

/** Formatea un instante UTC a la zona del negocio, en español. */
function formatWhen(iso: string, timezone: string): string {
  try {
    return new Intl.DateTimeFormat('es-CO', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: timezone,
    }).format(new Date(iso));
  } catch {
    return new Date(iso).toISOString();
  }
}

interface Row {
  customer_email: string | null;
  customer_name: string;
  service_name: string;
  staff_name: string | null;
  starts_at: string;
  business_name: string;
  timezone: string;
  brand_color: string | null;
  address: string | null;
}

/**
 * Envía la notificación de una cita. Busca todos los datos a partir del id.
 * No lanza: si falta el correo del cliente o algo falla, simplemente no envía.
 */
export async function notifyAppointment(appointmentId: string, kind: Kind): Promise<void> {
  try {
    const { rows } = await query<Row>(
      `SELECT a.customer_email, a.customer_name, a.starts_at,
              s.name AS service_name,
              u.full_name AS staff_name,
              t.name AS business_name, t.timezone,
              tb.primary_color AS brand_color, tb.address
       FROM appointments a
       JOIN services s ON s.id = a.service_id
       JOIN staff_profiles sp ON sp.id = a.staff_id
       JOIN users u ON u.id = sp.user_id
       JOIN tenants t ON t.id = a.tenant_id
       LEFT JOIN tenant_branding tb ON tb.tenant_id = t.id
       WHERE a.id = $1`,
      [appointmentId],
    );
    const r = rows[0];
    if (!r || !r.customer_email) return; // sin correo no se puede avisar

    const data: AppointmentEmailData = {
      businessName: r.business_name,
      customerName: r.customer_name,
      serviceName: r.service_name,
      staffName: r.staff_name ?? undefined,
      when: formatWhen(r.starts_at, r.timezone),
      address: r.address,
      brandColor: r.brand_color ?? undefined,
    };

    const tpl =
      kind === 'booked' ? bookedEmail(data)
      : kind === 'cancelled' ? cancelledEmail(data)
      : reminderEmail(data);

    await sendMail({ to: r.customer_email, subject: tpl.subject, html: tpl.html });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[notify] Error al notificar cita:', err);
  }
}
