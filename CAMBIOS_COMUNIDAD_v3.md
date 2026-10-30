# TurnosYa v3 — Comunidad de negocios, autogestión y PWA

> Entregable generado con asistencia de IA. **Debe ser revisado y validado por el responsable técnico de ITS antes de aplicarse en QA/producción.**

## Objetivo
Convertir el sitio principal en un centro de negocios público (directorio con búsqueda), dar al dueño autogestión completa de su negocio (logo cargado desde el equipo, colores, link personalizado y QR, contacto y ubicación), permitir al superadmin cambiar la marca de la plataforma y ofrecer instalación como app (PWA).

## Qué cambió

### Sitio principal (`/`)
- Directorio de negocios: búsqueda por texto (nombre, servicio, categoría, ciudad), chips de categoría, filtro por ciudad, **"Cerca de mí" (GPS)** con orden por distancia y radio (2/5/10/25 km), orden por calificación o nuevos, paginación, filtros en la URL para compartir.
- Tarjetas con portada/colores del negocio, logo, categoría, ciudad, calificación, distancia y precio desde.
- Secciones "Cómo funciona", banda de app, llamada para negocios (2 meses gratis) y pie.
- **Botón Instalar app** (barra superior, sección y barra flotante en celular). En iPhone muestra instrucciones (Compartir → Agregar a inicio).

### Login y registro
- Login ofrece dos opciones de registro: **Soy cliente** (`/registro`) y **Tengo un negocio** (`/registro-negocio`). Soporta `?returnUrl=` (solo rutas internas).
- **Cuenta de cliente global**: una sola cuenta sirve para todos los negocios. Las cuentas antiguas por negocio siguen funcionando.
- Registro de negocio pide tipo de negocio y ciudad.

### Página del negocio (`/<link>` y `/sitio/<link>`)
- Cualquiera puede ver el negocio (portada, logo, categoría, calificación, contacto, mapa, compartir).
- **Para confirmar el turno se exige iniciar sesión como cliente.** La selección (servicio, día, hora) se guarda y se recupera al volver del login/registro.
- Selector de días tipo "Hoy / Mañana / …", nombre del profesional en cada horario.

### Panel del dueño
- **Mi negocio**: logo y portada cargados desde el equipo (se reducen en el navegador), colores con paletas sugeridas, nombre, categoría, ciudad, frase, descripción, visibilidad en el directorio, **link personalizado con verificación en vivo**, WhatsApp/teléfono/correo/Instagram/web, dirección y **ubicación GPS** (o coordenadas manuales). Vista previa de su tarjeta en el directorio.
- **Link y QR**: copiar, WhatsApp, compartir, QR descargable y **afiche listo para imprimir**.
- **Primeros pasos**: lista de configuración con avance (logo, categoría, ubicación, contacto, servicios, empleado con horario).

### Superadmin
- Pestaña **Marca**: nombre, frase, **logo cargado desde el equipo**, color principal y secundario. Se aplica a sitio principal, login, paneles y color de la barra del navegador/PWA. Lista de negocios muestra categoría, ciudad y link.

### Backend / base de datos
- Migración `005_marketplace.sql`: `business_categories` (11 sembradas), columnas de perfil en `tenants` (categoría, ciudad, lat/lng, frase, `is_listed`), `cover_url/instagram/website` en branding, `secondary_color/tagline` en marca de plataforma, `media_assets` (imágenes en Postgres) y `customer_businesses`.
- Nuevos endpoints: `GET /api/directory/{categories,cities,businesses}`, `GET /api/platform/branding`, `POST /api/media/upload`, `GET /api/media/:id`, `POST /api/auth/register-customer`, `GET/PUT /api/tenant/profile`, `GET /api/tenant/slug-available/:slug`, `GET /api/tenant/onboarding`, `GET /api/loyalty/cards`.
- `POST /api/public/:slug/book` ahora **requiere token de cliente**; nombre/correo se toman de la cuenta.
- Fidelización funciona con cuentas globales (el negocio sale del QR).
- nginx: `client_max_body_size 5m` en `/api/`.

### Errores existentes corregidos
1. **Disponibilidad devolvía error 500** cuando no se elegía profesional (parámetro SQL sin tipo). Con eso la reserva pública no funcionaba.
2. **Horarios en UTC**: un horario 08:00 se calculaba como 08:00 UTC (03:00 en Colombia). Ahora se usa la zona horaria del negocio.
3. Fechas/números en inglés: se registró la configuración regional `es-CO`.

## Riesgos y consideraciones
- **Cambio de contrato**: reservar sin cuenta ya no es posible (decisión de negocio solicitada). Clientes de integraciones externas que llamen `/book` sin token recibirán 401.
- **Cambiar el link** de un negocio rompe el link/QR anterior (se advierte en pantalla). Recomendado a futuro: tabla de redirecciones de slugs antiguos.
- Imágenes en Postgres (máx. 2 MB c/u, normalmente < 300 KB tras reducirlas): simple para Coolify, pero aumenta el tamaño de los respaldos. Si crece mucho, migrar a S3/MinIO.
- Links cortos `/<slug>`: las rutas del frontend están en la lista `RESERVED_SLUGS` del backend. **Si se agrega una ruta nueva al frontend, agregarla también a esa lista.**
- La búsqueda usa `LIKE`, suficiente para cientos/miles de negocios; para volumen alto, considerar `pg_trgm` y `unaccent`.
- La reserva aún no valida en servidor que el horario esté dentro del turno del empleado (comportamiento previo).

## Verificación realizada (entorno local con datos de prueba)
- Backend: `tsc` sin errores; **18 pruebas unitarias OK** (nuevas: slugs, validación de imágenes por firma, URLs de imagen, zona horaria).
- Migraciones 001–005 aplicadas sobre Postgres limpio.
- Prueba de humo de API (OK): registro de negocios, slug reservado/tomado, carga de logo (PNG OK, SVG rechazado, owner no puede subir logo de plataforma), directorio con distancia/radio/categoría/texto, reserva anónima → 401, reserva de cliente → 201 en hora local, cliente aparece en "Clientes" del dueño, fidelización multi-negocio, marca de plataforma.
- Frontend: build de producción OK (inicial 364 kB, sin alertas de presupuesto); 3 pruebas unitarias OK.
- Recorrido E2E en Chromium (escritorio 1440 px y celular 390 px): directorio, cerca de mí, búsqueda, página del negocio, bloqueo por login, login con regreso y reserva confirmada, mis citas, registros, panel dueño (Mi negocio, link reservado, Link y QR, primeros pasos), superadmin (Marca, Negocios). Sin errores de consola.
- No verificado aquí: instalación real de la PWA en dispositivo (requiere HTTPS y teléfono), pagos Wompi, envío de correos.

## Pruebas sugeridas en QA
1. Desplegar en QA → confirmar que la migración 005 corre al arrancar el contenedor `api`.
2. Registrar un negocio, completar Mi negocio con logo desde el celular y "Usar mi ubicación actual" estando en el local.
3. Escanear el QR/afiche impreso con un celular y reservar con una cuenta nueva.
4. En Android/Chrome: verificar el botón "Instalar app"; en iPhone/Safari: las instrucciones.
5. Superadmin: cambiar logo y colores y verificar sitio principal, login y paneles.
6. Verificar que clientes antiguos (registrados por negocio) siguen pudiendo iniciar sesión y ver sus citas.
