# TurnosYApp — Funcionalidades comerciales

Inventario para futuras piezas de redes sociales, landing y presentaciones.
Basado en la revisión del código (backend Fastify + frontend Angular PWA), versión con módulo comercial v4.

> ✅ = existe en el código · 🆕 = agregado en esta versión · ⚙️ = depende del plan contratado

---

## 1. Mensajes clave (para titulares)

- **"Tu turno, sin filas."** Los clientes reservan solos, 24/7, desde el celular.
- **"Deja de agendar por WhatsApp."** Se acaban los mensajes de "¿hay turno?", las citas cruzadas y las libretas.
- **"Te encuentran cerca."** Directorio público de negocios con búsqueda por categoría, ciudad y GPS.
- **"Tu página de reservas lista en minutos."** Link propio, QR, logo y colores de tu marca.
- **"Cobra al reservar."** 🆕 Pagos en línea o anticipos con Wompi, directo a tu cuenta.
- **"Paga menos pagando por adelantado."** 🆕 Planes mensual, trimestral y semestral con descuento.
- **"Refiere y ahorra."** 🆕 Descuento para quien llega y recompensa para quien recomienda.

## 2. Problemas que resuelve (para piezas de "dolor → solución")

| Problema del negocio | Cómo lo resuelve TurnosYApp |
|---|---|
| Mensajes a toda hora preguntando por turno | Agenda en línea 24/7: el cliente ve la disponibilidad real y reserva solo |
| Citas cruzadas o dobles | El sistema bloquea el horario apenas se reserva (sin dobles reservas) |
| Clientes que no llegan | Recordatorios automáticos por correo ✅ · anticipo en línea 🆕 |
| Filas en el local | Cada cliente llega a su hora |
| Nadie conoce mi negocio | Perfil público en el directorio, búsqueda "cerca de mí" |
| Agenda de todo el equipo en desorden | Panel con la agenda del día/semana de cada empleado |
| Clientes que no vuelven | Tarjeta de fidelización con sellos y premio (QR de un solo uso) |
| No sé cuánto facturo | Panel de resumen y reportes ⚙️ |
| Cobrar es engorroso | Pagos en línea con Wompi: tarjeta, PSE, Nequi (según tu cuenta Wompi) 🆕 |

## 3. Funcionalidades por perfil

### Para el cliente final
- ✅ Busca negocios por categoría, ciudad o cercanía (GPS) en el directorio.
- ✅ Una sola cuenta para reservar en todos los negocios de la plataforma.
- ✅ Reserva en 3 pasos: servicio → hora (y profesional) → confirmar.
- ✅ Ve, cancela y gestiona sus citas en "Mis citas".
- ✅ Lista de espera cuando no hay cupo ⚙️.
- ✅ Califica y deja reseñas después de la cita ⚙️.
- ✅ Tarjeta de fidelización: suma sellos escaneando un QR en el local ⚙️.
- 🆕 Ve la **foto y especialidad** de quien lo va a atender ⚙️.
- 🆕 **Paga en línea** su cita o un anticipo con Wompi ⚙️.
- ✅ App instalable (PWA) en el celular.

### Para el dueño del negocio
- ✅ Página propia de reservas con link corto (`turnosyapp.com/tu-negocio`) y código QR.
- ✅ Logo, portada y colores de su marca.
- ✅ Servicios con duración y precio.
- ✅ Empleados con horario semanal y servicios que presta.
- 🆕 **Foto, nombre y cargo de cada empleado**; activar/desactivar empleados.
- ✅ Varias sedes ⚙️.
- ✅ Reglas de reserva: antelación mínima para reservar y cancelar, duración del turno.
- ✅ Agenda de todo el equipo por día.
- ✅ Clientes con historial.
- ✅ Programa de fidelización configurable (sellos para premio, servicio de regalo, vencimiento) ⚙️.
- ✅ Recordatorios por correo automáticos ⚙️.
- 🆕 **Datos de contacto completos en el micrositio**: WhatsApp, teléfono, correo, dirección, Instagram, **Facebook, TikTok, sitio web y horario de atención**.
- 🆕 **Pagos en línea con su propia cuenta Wompi**: cobro del valor completo o de un anticipo (%). El dinero llega directo al negocio.
- 🆕 **Suscripción flexible**: mensual, trimestral o semestral, con descuento por pagar por adelantado.
- 🆕 **Cobro automático** de la suscripción con tarjeta guardada (en el ciclo elegido).
- 🆕 **Código de referido propio** para invitar a otros negocios y ganar descuento.
- ✅ 2 meses de prueba gratis con todas las funciones.

### Para el empleado
- ✅ Ve solo su agenda del día y la semana.
- ✅ Marca citas como atendidas o "no vino".
- ✅ Bloquea sus horas libres.
- ✅ Genera el QR de un solo uso para sumar sellos de fidelización.

### Para la plataforma (superadmin)
- 🆕 **Panel de suscripciones y pagos**: ingreso mensual recurrente, recaudo del mes y 30 días, renovaciones próximas, pruebas por vencer, pagos vencidos y fallidos, gráfica de 6 meses, distribución por estado/plan/ciclo.
- 🆕 **Seguimiento de pagos** con filtros (estado, fechas, negocio) y detalle de descuentos.
- 🆕 **Pagos manuales** (transferencia/efectivo) que renuevan la suscripción.
- 🆕 **Ajuste de suscripciones** (estado, plan, ciclo, vencimiento).
- 🆕 **Planes con funcionalidades**: límites (empleados, servicios, sedes) y módulos activables por plan.
- 🆕 **Descuentos por ciclo** trimestral y semestral por plan.
- 🆕 **Programa de referidos** configurable (% para el nuevo negocio y % de recompensa), con anulación.
- 🆕 **Contacto del sitio principal** (WhatsApp, teléfono, correo, dirección, horario y redes) visible en el pie de página.
- 🆕 **Pasarela Wompi configurable desde el panel** (secretos cifrados), con prueba de conexión.
- ✅ Marca de la plataforma (logo, colores, frase).
- ✅ Activar o suspender negocios.

## 4. Funcionalidades por plan (catálogo configurable)

El superadmin decide qué incluye cada plan. Claves disponibles:

| Funcionalidad | Clave |
|---|---|
| Lista de espera | `waitlist` |
| Reseñas y calificaciones | `reviews` |
| Fidelización con QR | `loyalty` |
| Recordatorios por correo | `reminders` |
| Fotos del equipo en el micrositio | `staff_photos` |
| Pagos en línea de citas (Wompi) | `online_payment` |
| Reportes avanzados | `reports` |
| Destacado en el directorio | `featured` |

Planes por defecto (instalación nueva): **Básico** 49.000 COP/mes (3 empleados, 20 servicios, 1 sede; −5 % trimestral, −10 % semestral) y **Pro** 99.000 COP/mes (15 empleados, 100 servicios, 5 sedes, pagos en línea; −10 % trimestral, −15 % semestral). *Precios de ejemplo: confirmar antes de publicar.*

> Nota: `reports` y `featured` ya se pueden asignar a los planes, pero su comportamiento visible (reportes avanzados y posición destacada en el directorio) aún no está desarrollado. No usarlos como promesa comercial hasta implementarlos.

## 5. Tipos de negocio (categorías del directorio)

Barbería · Peluquería y belleza · Uñas y manicure · Spa y bienestar · Salud y consultorios · Odontología · Veterinaria y mascotas · Gimnasio y entrenamiento · Taller y lavadero · Asesorías y servicios · Otros.

## 6. Ideas de piezas para redes

1. **Carrusel "Antes / después"**: libreta y WhatsApp → agenda en línea.
2. **Reel "3 pasos"**: busca, elige la hora, listo.
3. **Pieza "Cobra al reservar"**: anticipo con Wompi para reducir ausencias.
4. **Pieza "Ahorra hasta X % pagando semestral"** (usar los % reales configurados).
5. **Pieza "Refiere y gana"**: código de referido, X % para ti y X % para tu colega.
6. **Pieza "Conoce a tu barbero"**: fotos del equipo en el micrositio.
7. **Pieza por categoría**: misma plantilla para barberías, spas, consultorios, veterinarias, gimnasios, talleres.
8. **Pieza "2 meses gratis"** con todas las funciones.
