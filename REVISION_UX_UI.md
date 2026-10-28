# TurnosYa — Renovación UX/UI (octubre de 2026)

## Alcance y supuestos

- **Framework preservado:** Angular 22, componentes standalone, FormsModule, Signals y rutas lazy existentes.
- **Sistema visual:** CSS/SCSS propio con variables de diseño, sin incorporar bibliotecas de componentes ni dependencias nuevas.
- **Backend sin cambios:** endpoints, autenticación/JWT, guardias, roles, contratos de API, pagos Wompi y funcionalidades existentes se conservan.
- **Marca por negocio:** el sitio público sigue usando colores/logo configurados por el propietario. Se añade cálculo de contraste y se restablecen las variables al abandonar ese sitio.

## Auditoría inicial

- Estilos globales sin arquitectura de panel uniforme, abundantes atributos `style` incrustados.
- Barras de navegación y métricas diferentes entre vistas; tarjetas con escasa jerarquía visual.
- Formularios de registro y paneles con `label` sin relación explícita a sus inputs.
- Servicios reservables y estrellas de reseña implementados con elementos no operables por teclado.
- Estados de carga/error inexistentes o sin confirmación en distintas mutaciones.
- Favicon e iconos PWA aún correspondientes a Angular, no a TurnosYa.

## Cambios aplicados

- Tokens de tipografía, tonos, superficies, bordes, sombras, radii, espaciado y movimientos.
- Login/registro en layout responsivo con panel de presentación y formulario accesible; se mantuvo el endpoint y la redirección por rol.
- Paneles de propietario, colaborador, cliente y superadministrador con encabezado, navegación, métricas, formularios y tarjetas coherentes.
- Reserva pública como flujo visual de tres pasos con tarjetas accesibles por teclado y resumen de la selección.
- Estados `hover`, `focus-visible`, `active`, `disabled`, `busy`, errores y confirmaciones.
- Mensajes de errores/éxito no bloqueantes para acciones operativas; botones de reseña accesibles y etiquetas de campos explícitas.
- Diseño responsive en escritorio, tablet y móvil; control de `prefers-reduced-motion` y acceso directo a contenido por teclado.
- Branding de PWA/favicons; se conserva el árbol y el nombre de archivos de iconos requeridos por el manifest.
- Pruebas unitarias añadidas para colores del negocio (pendientes de ejecutar en entorno con dependencias instaladas).

## Verificación realizada y límites

- **OK:** archivos TypeScript analizados sin errores de sintaxis con el parser de TypeScript.
- **OK:** comparación de archivos del proyecto: las rutas, servicios de autenticación, backend y llamadas principales no se reescribieron.
- **OK:** pruebas de composición visual en Chromium sobre maquetas HTML que comparten los estilos CSS de producción (1440 × 900 y 390 × 844); sin desbordamiento horizontal detectado.
- **PENDIENTE en este entorno:** `npm ci`, compilación real de Angular y pruebas de integración. Faltan paquetes de la caché y la red no resuelve `registry.npmjs.org` (`ENOTCACHED` para `zod-4.6.6.tgz`). La máquina dispone de Node 22.16.0, inferior al exigido por varias dependencias del lockfile. No se declara compilación o E2E de negocio como verificados.

## Validación recomendada antes de subir a producción

```bash
cd frontend
node --version   # Utiliza una versión soportada por Angular 22
npm ci
npm run build
npm test -- --watch=false
npm start
```

Probar con cuentas reales o fixtures de los cuatro perfiles: login y redirección, reservas públicas, alta de negocio/cliente, agenda y QR de fidelización, cambios de horario, servicios, branding, estados de negocio y pagos Wompi (sandbox). Validar la marca personalizada en colores claros/oscuros, y navegación por teclado en móvil y escritorio. Revisar consola y peticiones XHR en un entorno con API disponible. No se cambiaron configuraciones de producción ni credenciales.
