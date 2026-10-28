/**
 * Configuración central cargada desde variables de entorno.
 * Se valida al arranque; si falta algo obligatorio, el proceso falla rápido.
 */
import { z } from 'zod';

const schema = z.object({
  APP_URL: z.string().url().default('http://localhost:4200'),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET debe tener al menos 32 caracteres'),
  ENCRYPTION_KEY: z.string().length(64, 'ENCRYPTION_KEY debe ser hex de 32 bytes (64 chars)'),
  USER_ADMIN: z.string().email(),
  PASSWORD_ADMIN: z.string().min(6),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('0.0.0.0'),

  // Opcionales
  PLATFORM_WOMPI_PUBLIC_KEY: z.string().optional(),
  PLATFORM_WOMPI_PRIVATE_KEY: z.string().optional(),
  PLATFORM_WOMPI_INTEGRITY_SECRET: z.string().optional(),
  PLATFORM_WOMPI_EVENTS_SECRET: z.string().optional(),
  PLATFORM_WOMPI_ENVIRONMENT: z.enum(['test', 'prod']).default('test'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().default('TurnosYa <no-reply@turnosya.com>'),
  REMINDER_LEAD_MINUTES: z.coerce.number().int().positive().default(120),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('Error de configuración:', z.treeifyError(parsed.error));
  process.exit(1);
}

export const config = parsed.data;
export type Config = typeof config;
