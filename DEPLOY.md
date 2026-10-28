# Despliegue en Coolify

## 1. Crear el recurso
En Coolify, crea un recurso tipo **Docker Compose** apuntando a este repositorio. Coolify detecta `docker-compose.yml` en la raíz.

## 2. Variables de entorno
Define estas variables en Coolify (sección Environment Variables):

### Obligatorias
| Variable | Ejemplo / nota |
|----------|----------------|
| `APP_URL` | `https://turnosya.tudominio.com` (HTTPS, el dominio del front) |
| `POSTGRES_PASSWORD` | contraseña fuerte de la base |
| `JWT_SECRET` | `openssl rand -hex 32` |
| `ENCRYPTION_KEY` | `openssl rand -hex 32` (64 chars hex) |
| `USER_ADMIN` | correo del superadmin, ej. `admin@turnosya.com` |
| `PASSWORD_ADMIN` | contraseña inicial del superadmin |

### Opcionales
`POSTGRES_USER`, `POSTGRES_DB`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`. Para el cobro con Wompi, ver la sección 5.

## 3. Dominio
Apunta el dominio HTTPS al servicio **`web`**, puerto **8080**. Coolify gestiona el certificado TLS.

## 4. Primer arranque
- El servicio `api` aplica las migraciones automáticamente al iniciar (001_init) y crea el superadmin + 2 planes (Básico, Pro).
- Entra a `APP_URL/login` con `USER_ADMIN` / `PASSWORD_ADMIN` para el panel de superadmin.
- Los dueños se registran en `APP_URL/registro-negocio` (trial de 2 meses).
- Cada negocio queda público en `APP_URL/sitio/<slug>`.

## 5. Cobro con Wompi

El cobro de la suscripción mensual usa Wompi (Colombia).

Variables necesarias (en Coolify):
- `PLATFORM_WOMPI_PUBLIC_KEY` — llave pública (pub_prod_... o pub_test_...).
- `PLATFORM_WOMPI_PRIVATE_KEY` — llave privada (prv_...). **Solo** para el cobro recurrente automático; nunca se expone al navegador.
- `PLATFORM_WOMPI_INTEGRITY_SECRET` — secreto de integridad (firma el checkout y las transacciones).
- `PLATFORM_WOMPI_EVENTS_SECRET` — secreto de eventos (valida el webhook).
- `PLATFORM_WOMPI_ENVIRONMENT` — `test` o `prod`.

Configura la **URL de eventos** en el Dashboard de comercios de Wompi, apuntando a:

```
https://TU_DOMINIO/api/billing/wompi/webhook
```

Usa una URL distinta para Sandbox y para Producción.

Flujo:
1. El dueño entra a su panel → pestaña **Suscripción** → elige plan → **Pagar con Wompi**.
2. El backend crea un pago `pending` con referencia única y firma de integridad, y el front redirige al Web Checkout de Wompi.
3. Wompi cobra y envía `transaction.updated` al webhook. El backend valida la firma del evento (SHA256 de `properties + timestamp + secreto`) y, si la transacción es `APPROVED`, marca el pago `approved` y **renueva la suscripción un mes** (idempotente: no renueva dos veces la misma referencia).

Si las variables de Wompi no están, `/api/billing/checkout` responde 503 y el pago en línea queda deshabilitado (el superadmin puede seguir activando suscripciones a mano).

### Cobro recurrente automático mensual

El dueño activa el cobro automático desde el panel (pestaña Suscripción → "Guardar tarjeta y activar"). Se tokeniza la tarjeta con el widget de Wompi; el backend crea una **fuente de pago** (`POST /v1/payment_sources`, con la llave privada) y guarda su id.

Programa un **cron diario** que ejecute el job de cobro sobre el servicio `api`:

```
node dist/jobs/charge-recurring.js
```

El job cobra a las suscripciones con auto-renovación cuyo período vence (ventana de 1 día), crea la transacción recurrente en Wompi y registra el intento. El webhook confirma el `APPROVED` y renueva el mes. Tras 3 cobros fallidos, la suscripción pasa a `past_due` y se desactiva el auto-cobro.

## 6. Correos (SMTP) y recordatorios

Los correos de **confirmación** y **cancelación** se envían automáticamente al reservar o cancelar.

Configura el SMTP con las variables `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`. Si no están definidas, el sistema funciona igual pero los correos solo se registran en el log (modo sin correo).

Para los **recordatorios**, programa un cron que ejecute el job periódicamente (cada 15-30 min). En Coolify, usa un Scheduled Task sobre el servicio `api`:

```
node dist/jobs/send-reminders.js
```

Envía recordatorio a las citas que empiezan dentro de `REMINDER_LEAD_MINUTES` (por defecto 120) y marca cada cita para no repetir. Es idempotente.

## 7. Notas
- No reinicializar la base: las migraciones son idempotentes y se registran en la tabla `_migrations`.
- El healthcheck del API es `/api/health`; el de `web` sirve `/`.
- nginx del front proxea `/api` al servicio `api` por la red interna de Coolify.
