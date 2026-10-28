/**
 * Plantillas de correo en español. Funciones puras: reciben datos y devuelven
 * { subject, html }. Así se pueden testear sin enviar nada.
 */

export interface AppointmentEmailData {
  businessName: string;
  customerName: string;
  serviceName: string;
  staffName?: string;
  /** Fecha/hora ya formateada en la zona del negocio, ej. "lun 3 nov, 10:30". */
  when: string;
  address?: string | null;
  brandColor?: string;
}

function layout(brandColor: string, title: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"></head>
<body style="margin:0;background:#f6f7fb;font-family:system-ui,Segoe UI,Roboto,sans-serif;color:#1f2430">
  <div style="max-width:520px;margin:0 auto;padding:24px">
    <div style="background:${brandColor};color:#fff;padding:18px 24px;border-radius:12px 12px 0 0">
      <h1 style="margin:0;font-size:1.2rem">${title}</h1>
    </div>
    <div style="background:#fff;padding:24px;border-radius:0 0 12px 12px;border:1px solid #e5e7eb;border-top:none">
      ${bodyHtml}
    </div>
    <p style="text-align:center;color:#6b7280;font-size:.8rem;margin-top:16px">Enviado por TurnosYa</p>
  </div>
</body></html>`;
}

function detailRow(label: string, value: string): string {
  return `<tr>
    <td style="padding:6px 0;color:#6b7280;font-size:.9rem">${label}</td>
    <td style="padding:6px 0;text-align:right;font-weight:600">${value}</td>
  </tr>`;
}

function detailsTable(d: AppointmentEmailData): string {
  return `<table style="width:100%;border-collapse:collapse;margin:12px 0">
    ${detailRow('Servicio', d.serviceName)}
    ${d.staffName ? detailRow('Con', d.staffName) : ''}
    ${detailRow('Cuándo', d.when)}
    ${d.address ? detailRow('Dónde', d.address) : ''}
  </table>`;
}

/** Confirmación al reservar. */
export function bookedEmail(d: AppointmentEmailData): { subject: string; html: string } {
  const color = d.brandColor ?? '#2563EB';
  const html = layout(
    color,
    `Cita confirmada en ${d.businessName}`,
    `<p>Hola ${d.customerName}, tu cita quedó reservada. 🎉</p>
     ${detailsTable(d)}
     <p style="color:#6b7280;font-size:.9rem">Si no puedes asistir, cancela desde tu cuenta con tiempo.</p>`,
  );
  return { subject: `Tu cita en ${d.businessName} está confirmada`, html };
}

/** Aviso de cancelación. */
export function cancelledEmail(d: AppointmentEmailData): { subject: string; html: string } {
  const color = d.brandColor ?? '#2563EB';
  const html = layout(
    color,
    `Cita cancelada`,
    `<p>Hola ${d.customerName}, tu cita en ${d.businessName} fue cancelada.</p>
     ${detailsTable(d)}
     <p style="color:#6b7280;font-size:.9rem">¿Fue un error? Puedes reservar de nuevo cuando quieras.</p>`,
  );
  return { subject: `Cita cancelada en ${d.businessName}`, html };
}

/** Recordatorio antes de la cita. */
export function reminderEmail(d: AppointmentEmailData): { subject: string; html: string } {
  const color = d.brandColor ?? '#2563EB';
  const html = layout(
    color,
    `Recordatorio de tu cita`,
    `<p>Hola ${d.customerName}, te recordamos tu cita en ${d.businessName}.</p>
     ${detailsTable(d)}
     <p style="color:#6b7280;font-size:.9rem">¡Te esperamos!</p>`,
  );
  return { subject: `Recordatorio: tu cita en ${d.businessName}`, html };
}
