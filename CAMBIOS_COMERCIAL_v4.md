# TurnosYApp v4 — Módulo comercial

> **Requiere validación humana** antes de desplegar en producción (política ITS METGROUP).
> Las pruebas de este documento se ejecutaron con datos y llaves ficticias en una base local.

## 1. Objetivo

1. Panel del superadmin para seguimiento de suscripciones y pagos.
2. Descuentos por códigos de referido de negocios suscritos activos.
3. Funcionalidades y límites por plan.
4. Suscripción mensual, trimestral y semestral, con descuento por ciclo.
5. Foto de empleados.
6. Datos de contacto del sitio principal (superadmin) y de cada micrositio (dueño).
7. Configuración de Wompi para pagos en línea: de la plataforma (suscripciones) y de cada negocio (citas).

## 2. Cambios por capa

### Base de datos — `backend/src/db/migrations/006_commercial.sql`
| Tabla / columna | Uso |
|---|---|
| `plans.description`, `discount_quarterly_pct`, `discount_semiannual_pct` | Descripción y descuentos por ciclo (0–90 %) |
| `platform_settings` (fila única) | Contacto del sitio, reglas de referidos y credenciales Wompi de la plataforma (secretos cifrados) |
| `subscriptions.billing_cycle_months` (1/3/6), `referral_code` | Ciclo elegido y código propio del negocio |
| `referrals` | Referido → `pending` → `converted` (pagó) → `rewarded` (recompensa usada) / `void` |
| `subscription_payments.*` | Valor base, descuento, detalle, referido usado, recompensa usada, notas, origen `wompi`/`manual` |
| `tenant_branding.facebook`, `tiktok`, `opening_hours` | Contacto extra del micrositio |
| `staff_profiles.photo_url` + `media_assets.kind = 'staff_photo'` | Foto de empleados |
| `tenant_payment_settings` | Wompi del negocio (secretos cifrados), cobro completo o anticipo |
| `appointment_payments`, `appointments.payment_status` | Pagos de citas |

La migración es aditiva; se probó sobre una base vacía y sobre una base con datos de la v3 (planes, suscripciones y pagos existentes se conservan; los planes existentes mantienen sus funcionalidades y reciben valores por defecto solo en las claves que no tenían).

### Backend (nuevos)
- `lib/pricing.ts` — cálculo puro: ciclo → referido → recompensa (en cascada, sin negativos).
- `lib/plan-features.ts` — catálogo de funcionalidades y resolución de límites. **Prueba gratis = todas las funcionalidades.**
- `lib/crypto.ts` — AES-256-GCM con `ENCRYPTION_KEY` para secretos en BD.
- `lib/wompi-config.ts` — credenciales de plataforma (panel → si vacío, variables de entorno) y de negocio.
- `lib/subscription-billing.ts` — cotización, referidos y aplicación de pagos aprobados.
- `routes/admin-commercial.ts` — `/api/admin/billing/summary`, `/subscriptions`, `/payments`, `/payments/manual`, `/referrals`, `/settings/{referrals,contact,wompi}`, `/plan-features`.
- `routes/payments.ts` — `/api/payments/tenant/wompi`, `/appointments/:id/checkout`, `/wompi/:tenantId/webhook`.

### Backend (modificados)
- `billing.ts`: `POST /quote`, checkout con ciclo y descuentos, webhook valida **monto** además de firma, referidos (`GET /referrals`, `POST /referral`), suscripción con funcionalidades/límites.
- `superadmin.ts`: planes con descripción, descuentos y funcionalidades saneadas; ajuste de ciclo.
- `staff.ts`: `PUT /api/staff/:id` (nombre, cargo, foto, sede, activo) y límite de empleados.
- `services.ts`, `tenant.ts` (sedes): límites del plan (HTTP 403 `PLAN_LIMIT`).
- `loyalty.ts`: requiere la funcionalidad `loyalty`.
- `tenant.ts`: contacto extra y `GET /entitlements`.
- `public.ts`: foto de empleados (si el plan la incluye), contacto extra y disponibilidad de pago en línea.
- `customer.ts`: estado de pago y `canPay` en "Mis citas".
- `auth.ts`: `referralCode` opcional al registrar un negocio.
- `platform.ts`: `GET /api/platform/contact`.
- `jobs/charge-recurring.ts`: cobra el ciclo con su descuento y la recompensa pendiente.
- `lib/wompi.ts`: funciones aceptan credenciales (compatibles con el uso anterior).

### Frontend
- Superadmin: pestañas nuevas **Suscripciones y pagos**, **Planes** (rediseñada), **Referidos**, **Contacto**, **Pasarela**.
- Dueño: **Suscripción** (ciclo, cotización con descuentos, referidos, cobro automático por ciclo), **Pagos en línea** (Wompi propio), edición de empleados con **foto**, contacto extra en "Mi negocio".
- Público: foto y cargo del profesional, Facebook/TikTok/horario, botón "Pagar ahora" tras reservar, contacto de la plataforma en el pie de página.
- Cliente: botón "Pagar en línea" en "Mis citas".
- Registro de negocio: campo de código de referido (también por link `?ref=CODIGO`).

## 3. Reglas de negocio implementadas

- **Descuentos**: se aplican en cascada sobre el saldo: ciclo → referido (solo primer pago) → recompensa (una por pago, la más antigua).
- **Código de referido**: solo es válido si el negocio que refiere tiene suscripción `active` y negocio activo; no se puede usar el propio; solo antes del primer pago aprobado.
- **Recompensa**: queda disponible cuando el referido paga; se consume en el siguiente pago aprobado de quien refirió.
- **Límites**: se validan al crear o reactivar empleados, servicios y sedes; lo existente no se desactiva al bajar de plan.
- **Webhook**: firma válida + monto igual al registrado; si el monto difiere, el pago queda en `error` y no renueva. Es idempotente.
- **Secretos**: nunca se devuelven al frontend (solo `••••1234`); se guardan cifrados.

## 4. Riesgos y consideraciones

| Riesgo | Mitigación / acción requerida |
|---|---|
| Rotar `ENCRYPTION_KEY` invalida los secretos guardados desde el panel | No rotarla sin volver a ingresar las credenciales; documentar en el gestor de secretos |
| Dos pagos pendientes podrían tomar la misma recompensa | Solo el primero aprobado la marca como usada; impacto bajo (descuento duplicado puntual). Revisar en el panel de referidos |
| Bajar de plan no desactiva empleados/servicios sobrantes | Decisión de producto pendiente (hoy solo bloquea nuevos) |
| `reports` y `featured` existen como funcionalidades pero sin comportamiento | No venderlas hasta implementarlas |
| Webhook por negocio: cada negocio debe registrar su URL en Wompi | La URL se muestra en "Pagos en línea" con botón copiar |
| Pago de cita no se reembolsa al cancelar | Reembolsos se gestionan en el panel de Wompi del negocio; definir política |
| El build de producción incrusta Google Fonts | Requiere salida a internet en el pipeline (sin cambios respecto a v3) |

## 5. Despliegue

1. Respaldo de la base de datos.
2. `npm run migrate` (aplica `006_commercial.sql`).
3. Desplegar `api` y `web`.
4. Superadmin › **Pasarela**: verificar origen de credenciales (las de entorno siguen funcionando) y **Probar conexión**.
5. Superadmin › **Planes**: revisar funcionalidades y descuentos de cada plan.
6. Superadmin › **Referidos** y **Contacto**: definir porcentajes y datos públicos.
7. Cron existente `npm run charge` sin cambios de programación.

## 6. Pruebas ejecutadas

| Prueba | Resultado |
|---|---|
| `npm run typecheck` (backend) | OK |
| `npm test` (backend): 36 pruebas, 18 nuevas (precios, referidos, funcionalidades, cifrado, cobro de citas) | 36/36 OK |
| Migración sobre base vacía y sobre base v3 con datos | OK |
| Integración contra API + Postgres local (22 escenarios: login, planes, Wompi panel, referidos, pago manual, checkout + webhook firmado, idempotencia, monto alterado, límites, foto, micrositio, pago de cita, panel, permisos) | 22/22 OK |
| Secretos cifrados en BD (sin texto plano) | OK |
| `ng build` producción (con incrustación de fuentes desactivada por falta de red en el sandbox) y desarrollo | OK, sin advertencias |
| Revisión visual (escritorio 1366 px y móvil 390 px) de las pantallas nuevas | OK |

### Pendiente (validación humana)
- Pruebas en **sandbox real de Wompi**: Web Checkout, tokenización y cobro recurrente con llaves `pub_test_`/`prv_test_` reales y eventos entregados por Wompi.
- `ng build` de producción en el pipeline con acceso a Google Fonts.
- Pruebas E2E de negocio con usuarios reales de QA y revisión de textos/precios comerciales.
- Revisión de seguridad del manejo de secretos por el responsable de infraestructura.

## 7. Pagos con Nequi (migración `007_nequi.sql`)

Nequi no avisa los pagos a terceros, así que el flujo es **manual con comprobante**:

| Quién paga | A quién | Qué hace quien paga | Quién aprueba | Efecto al aprobar |
|---|---|---|---|---|
| Negocio (suscripción) | Plataforma | Elige plan y ciclo › "Pagar con Nequi" › escanea QR o transfiere al número › sube la captura | Superadmin › Suscripciones y pagos (Ver comprobante › Aprobar/Rechazar) | Renueva el plan por el ciclo pagado, con descuentos y referidos |
| Cliente (cita) | Negocio | Tras reservar o en "Mis citas" › "Pagar con Nequi" › sube la captura | Dueño › Pagos en línea › Pagos por Nequi | La cita queda pagada |

- **Configuración**: superadmin › Pasarela › Nequi de la plataforma; dueño › Pagos en línea › Tu cuenta Nequi. Número (celular de 10 dígitos que inicia por 3), titular y QR (imagen descargada de la app Nequi › Recibir con QR).
- **Valor**: suscripción = cotización del plan y ciclo (con descuentos). Cita = valor completo o anticipo según el modo de cobro del negocio (compartido con Wompi).
- **Comprobantes privados** (`payment_proofs`): solo los ve el superadmin (suscripciones) o el dueño de ese negocio (citas); se sirven con `Cache-Control: no-store`. El QR sí es público.
- **Reglas**: un comprobante pendiente a la vez por negocio (suscripción) y por cita; rechazo con motivo visible para quien pagó, que puede reenviar; aprobar/rechazar solo pagos Nequi pendientes (idempotente).
- **Plan**: Nequi para citas usa la misma funcionalidad `online_payment` del plan.

Endpoints: `GET/PUT /api/admin/settings/nequi`, `GET /api/admin/payments/:id/proof`, `POST /api/admin/payments/:id/approve|reject`, `GET/POST /api/billing/nequi`, `GET/PUT /api/payments/tenant/nequi`, `POST /api/payments/appointments/:id/nequi`, `GET /api/payments/tenant/review`, `GET /api/payments/tenant/payments/:id/proof`, `POST /api/payments/tenant/payments/:id/approve|reject`.

Pruebas: 3 unitarias nuevas (número, configuración, comprobante) y 6 escenarios de integración (configurar, pagar, duplicado, privacidad del comprobante, aprobar/rechazar y reenviar). Total backend: **39/39 unitarias**, **28/28 integración**.

**Riesgo**: la aprobación depende de que quien revisa confirme el ingreso en su app Nequi (un comprobante puede ser falso). Recomendación: aprobar solo tras verlo en el movimiento de Nequi.

## 8. Mejoras sugeridas
- Correo al superadmin y al dueño cuando un pago falla o una suscripción pasa a `past_due`.
- Exportar pagos a CSV/Excel desde el panel.
- Implementar `reports` (ingresos por servicio/empleado) y `featured` (orden en el directorio).
- Notificar al negocio cuando se convierte un referido suyo.
- Reembolsos/anulaciones de pagos de citas desde el panel.
- Correo al superadmin/dueño cuando llega un comprobante Nequi y a quien pagó cuando se aprueba o rechaza.
