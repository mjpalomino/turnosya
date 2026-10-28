/**
 * Envío de correos por SMTP (nodemailer).
 *
 * Se configura por variables de entorno (SMTP_*). Si no están definidas, el
 * mailer entra en modo "no-op": no falla, solo registra en consola. Así el
 * sistema funciona aunque no haya servidor de correo configurado todavía.
 *
 * El envío nunca bloquea ni rompe el flujo de negocio: se llama "fire and
 * forget" y los errores solo se loguean.
 */
import nodemailer, { type Transporter } from 'nodemailer';
import { config } from '../config.ts';

let transporter: Transporter | null = null;
let ready = false;

function getTransporter(): Transporter | null {
  if (ready) return transporter;
  ready = true;
  if (!config.SMTP_HOST || !config.SMTP_USER) {
    // eslint-disable-next-line no-console
    console.warn('[mailer] SMTP no configurado; los correos se registrarán en consola.');
    return null;
  }
  transporter = nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_PORT === 465, // 465 = TLS implícito
    auth: { user: config.SMTP_USER, pass: config.SMTP_PASS ?? '' },
  });
  return transporter;
}

export interface MailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/** Envía un correo. No lanza: devuelve true si se envió, false si no. */
export async function sendMail(input: MailInput): Promise<boolean> {
  const t = getTransporter();
  if (!t) {
    // eslint-disable-next-line no-console
    console.log(`[mailer:noop] Para ${input.to} — ${input.subject}`);
    return false;
  }
  try {
    await t.sendMail({
      from: config.SMTP_FROM,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text ?? input.html.replace(/<[^>]+>/g, ' '),
    });
    return true;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[mailer] Error al enviar:', err);
    return false;
  }
}
