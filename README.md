# TurnosYa

SaaS multi-inquilino de gestión de **citas y turnos**. Cada negocio (barbería, spa, clínica, taller, etc.) autogestiona su sitio, sus servicios, su equipo y sus clientes bajo un esquema de suscripción mensual.

## Stack

| Capa     | Tecnología                                   |
|----------|----------------------------------------------|
| Backend  | Node 24 + Fastify 5 + TypeScript + Postgres 18 |
| Frontend | Angular 22 + PWA                             |
| Deploy   | Docker + Coolify (servicio `api` + servicio `web` nginx) |

## Roles

1. **Superadmin** — dueño de la plataforma. Gestiona planes, suscriptores y la marca de la plataforma.
2. **Dueño del sitio (owner)** — autogestiona su negocio: branding (colores, logo, contacto), servicios, empleados, horarios, fidelización.
3. **Empleado (staff)** — quien atiende. Ve **solo su propia agenda**, marca citas como atendidas/no vino, bloquea sus horas, suma stickers de fidelización.
4. **Cliente final** — reserva, confirma, cancela y reagenda citas; ve disponibilidad; consulta su tarjeta de fidelización.

## Suscripción

- **2 meses gratis** al registrarse (trial).
- Luego **2 planes** que el superadmin gestiona (precio, límites).
- Cobro **manual** y **automático** (Wompi).

## Módulos

### Cliente final
- Ver disponibilidad en calendario.
- Reservar / confirmar / cancelar / reagendar cita.
- Elegir servicio, sede y empleado.
- Lista de espera si no hay cupo.
- Recordatorios: correo + WhatsApp manual.
- Mis citas: historial y próximas.
- Pago en línea opcional (si el sitio lo activa).
- Reseñas y calificación tras la cita.
- Tarjeta de fidelización: ver stickers y canjear premio.

### Dueño del sitio
- Panel de resumen (citas de hoy, ingresos, huecos).
- Agenda día/semana de todo el equipo.
- Servicios (nombre, duración, precio).
- Empleados y sus horarios.
- Horario de atención, días cerrados, bloqueos.
- Varias sedes.
- Clientes: ficha, historial, notas.
- Branding: colores, logo, info de contacto.
- Reglas de reserva (antelación mínima, cancelación).
- Fidelización: stickers para premio, servicio gratis, vencimiento.
- Reportes: citas, ingresos, ausencias.

### Empleado
- Su agenda del día y la semana.
- Datos de cada cita.
- Marcar atendida / no vino / cancelar.
- Bloquear sus horas libres.
- Generar QR de un solo uso para sumar sticker de fidelización.

### Superadmin
- Clientes (dueños de sitios): activar / suspender.
- Planes y precios (CRUD).
- Suscriptores: estado, vencimiento, cobro.
- Marca de la plataforma.
- Métricas globales.

### Correos (SMTP)
- Confirmación y cancelación de cita se envían automáticamente (nodemailer).
- Recordatorios vía job `npm run reminders` (cron cada 15-30 min). Migración `003_reminders` evita duplicados.
- Plantillas en español con el color de marca del negocio. Sin SMTP configurado, los correos se registran en log sin romper el flujo.

### Cobro (Wompi)
- Pago único: el dueño paga desde el panel vía Wompi Web Checkout.
- Cobro recurrente automático: el dueño guarda su tarjeta (tokenización Wompi); el backend crea una fuente de pago y un cron diario (`npm run charge`) cobra el plan cada mes con `recurrent: true`. Tras 3 fallos pasa a `past_due`. Migración `004_recurring`.
- Webhook `POST /api/billing/wompi/webhook` valida la firma del evento y renueva la suscripción al aprobarse (idempotente).
- Recordatorios de cita: cron `npm run reminders`.
- Migración `002_billing` registra cada pago (`subscription_payments`).
- Ver `DEPLOY.md` sección 5 para la configuración.

### Base (todo SaaS)
- Login y seguridad por roles.
- Multi-inquilino (cada dueño ve solo su sitio).
- PWA instalable.
- Responsive y profesional.
- Español.
- Zona horaria por sitio.
- Correos automáticos.
- Dockerizado para Coolify.

## Módulo de fidelización (QR)

El empleado genera un **QR de un solo uso** (vence en minutos) desde su panel; el cliente lo escanea y suma un sticker a su tarjeta. Al alcanzar el número configurado por el dueño, el cliente gana un servicio gratis (o descuento). QR de un solo uso = no se puede falsificar ni sumar stickers sin estar en el local.

## Estructura del repo

```
turnosya/
  backend/          # API Fastify + TypeScript
    src/
      routes/       # endpoints por módulo
      plugins/      # auth, db, cors, etc.
      lib/          # utilidades (jwt, hash, validación)
      db/
        migrations/ # SQL versionado
      types/        # tipos compartidos
    test/           # tests (node:test)
  frontend/         # Angular 22 PWA
  docker-compose.yml
```

## Desarrollo local

```bash
# Backend
cd backend
cp .env.example .env
npm install
npm run migrate
npm run dev

# Frontend
cd frontend
npm install
npm start
```

## Despliegue en Coolify

Variables de entorno obligatorias: `APP_URL`, `POSTGRES_PASSWORD`, `ENCRYPTION_KEY`, `JWT_SECRET`, `USER_ADMIN`, `PASSWORD_ADMIN`.
Opcionales: `PLATFORM_WOMPI_*`, `SMTP_*`.

El dominio HTTPS apunta al servicio `web` (nginx, puerto 8080), que sirve el frontend y proxea `/api` al servicio `api`.
