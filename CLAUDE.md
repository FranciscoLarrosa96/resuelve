# Resuelve

Marketplace de servicios locales en Tandil. Frontend Angular 22 en `src/`, backend NestJS 11 + TypeORM + Postgres en `backend/`.
El detalle técnico está en `README.md` y `backend/README.md`: leelos antes de cambiar algo.

## Estado actual

- Auth real: access token solo en memoria, refresh token en sessionStorage (TODO: cookie HttpOnly).
  - Rotación con ventana de gracia (`REFRESH_REUSE_GRACE_SECONDS`, default 10): reintento del token recién rotado = hermano; fuera de la ventana = reuso, se revoca todo.
  - `AuthStore.status()`: `initializing` ≠ invitado. Solo un 401 (`sessionRejected`) borra la sesión; una request cortada por F5 o un 5xx no.
  - Todo `/pro/**` detrás de `professionalGuard`; `ProShell` sin usuario solo muestra "Cargando tu cuenta…". Nunca datos demo como respaldo.
- Catálogo, profesionales, requests, invitations, quotes, aceptación de presupuesto y privacidad ganador/perdedor: reales.
- Coordinación del trabajo real: el elegido propone cita, el cliente confirma/rechaza, `SCHEDULED`, Agenda real (`/pro/agenda`) y `COMPLETED` sin depender de reseña (`backend/README.md` → "Coordinación del trabajo y agenda"). `AWAITING_REVIEW` y `CLOSED` son legacy.
- Cierre del trabajo: terminado el horario confirmado, el cliente **o** el elegido lo marca realizado (`POST /requests/:id/complete`, guarda `completed_by`) o piden reprogramar. El tiempo NUNCA completa nada: "pendiente de cierre" (`isCompletionDue` → `completionDue`/`canComplete`) se deriva al consultar, sin cron. La UI no lo recalcula con su reloj: `refreshWhenDue` relee una vez en `endsAt` (sin polling ni F5).
- Pedido del cliente (`RequestStore`): `flowMode` DISCOVERY | TARGETED explícito y persistido; editar no rompe el target, solo un cambio que lo vuelve inelegible ("Buscar profesionales") o "Cambiar profesional". `desiredDate` (día de Argentina) es la única fuente de "Cuándo". Urgencias: los rubros son atajos + "Otro servicio" (catálogo real).
- Menú de cuenta único (`AccountMenu`): Mi perfil, cambio de modo, Tema (Claro / Oscuro / Sistema) y "Cerrar sesión" separado (header cliente, sidebar y header mobile profesional).
- Dark Mode por tokens semánticos (`src/styles.css`, `:root[data-theme='dark']` solo cambia valores): `surface` para superficies, `primary`/`*-fill` para rellenos con texto blanco, `brand` para texto/íconos/gráficos, `inverse` para toasts. Nunca `bg-white` ni hex en componentes. `ThemeStore` + script anti-flash en `index.html`, `localStorage` `resuelve-theme` (default Claro) (`README.md` → "Tema").
- Notificaciones in-app reales (`notifications`, `notify()` en la transacción de la acción, `dedupe_key` único, nunca a quien actúa): nueva solicitud (`PRO_REQUEST_RECEIVED`), presupuesto nuevo, horario propuesto/reprogramado, elegido, confirmado/rechazado. Polling de 60 s en `NotificationsStore`, badges por modo (cliente/profesional no se mezclan). Sin push/WebSocket (`README.md` → "Notificaciones in-app").
  - Avisos por email (`backend/src/notifications/email/`, `backend/README.md` → "Avisos por email"): job sobre las mismas notificaciones, apagado por defecto (`EMAIL_NOTIFICATIONS_ENABLED`, necesita SMTP), una frase general sin PII, un mensaje por persona, topes diario global y por persona, baja en Mi perfil y con enlace firmado `/avisos/baja`. Copy único en `email-notification-copy.ts`. Está en la Política de Privacidad (`#avisos`).
  - Destino por tipo en el backend (`NOTIFICATION_DESTINATION`, única fuente): Solicitudes + pestaña (Nuevas / Aceptadas) o Agenda. El summary trae `requests { total, PENDING, QUOTED, SELECTED }` y `agenda`; el menú suma solo lo de su sección. Se lee al abrir la solicitud (o el trabajo en la Agenda con `section=AGENDA`), nunca por entrar al listado.
- Clasificación del texto (`interpret-request.ts`): alias → palabras clave/nombre → si no hay coincidencia fuerte y única, "No estamos seguros del servicio" con opciones reales. Nunca un servicio por defecto. Íconos: un solo mapa `service-icons.ts` + `app-service-icon`.
- "¿Dónde es el trabajo?": un solo `WorkLocationPicker` en todos los flujos. Proveedor de direcciones detrás del backend (`/location/*`, `LOCATION_PROVIDER=none|google`); barrio inferido y confirmable, nunca adivinado; sin proveedor, dirección a mano + barrios. No se guardan coordenadas.
- Cloudinary: credenciales con `readCloudinaryConfig` (limpia espacios/comillas, acepta `CLOUDINARY_URL`, `CLOUDINARY_SIGNATURE_ALGORITHM=sha1|sha256`). "Invalid Signature" → `npm run cloudinary:check`.
- Foto de perfil profesional: Cloudinary público separado del privado de matrículas (`resuelve/avatars/<id>`, JPG/PNG/WebP ≤ 5 MB, EXIF fuera, entrega 256×256). `professional_profiles.avatar_public_id`/`avatar_url`. Foto ≠ identidad verificada.
- "Trabajos realizados": `professional_work_photos`, **máximo 5 por perfil garantizado en el backend** (lock del perfil), `resuelve/professional-work/<id>/`, JPG/PNG/WebP ≤ 8 MB, entrega ≤ 1600 px `q_auto,f_auto`, descripción ≤ 80 sin teléfonos ni emails, solo el dueño (403), borrar = Cloudinary + fila en la misma transacción. Free y PRO, no obligatorio. Público: `workPhotos`, sin sección si está vacío (`backend/README.md` → "Trabajos realizados"). `portfolio_items` es legacy: no se usa.
- Tu mes: navegación de meses en el header (‹ Anterior / Siguiente ›), oculta si el perfil tiene un solo mes.
- Comparar profesionales: `ComparisonStore` (única fuente, máx. 3, sessionStorage), `CompareTray` en resultados y perfil; cambiar de filtro o de modo no la vacía.
- Elegibilidad al invitar (`requestIneligibility`): perfil activo + servicio/matrícula + barrio o "Todo Tandil"; el presupuesto la revalida sin cobertura.
- Núcleo profesional (reglas en `backend/src/professionals/professional-rules.ts`, única fuente):
  - cobertura por barrios o "Todo Tandil" (`coversEntireCity`, no es una zona);
  - perfil `ACTIVE` / `PAUSED`;
  - "Disponible hoy" vence a medianoche de Argentina;
  - matrícula por servicio según `requiresLicense` (nunca por nombre), verificada por NÚMERO en el registro oficial; el documento es opcional y privado (Cloudinary).
- Panel admin `/admin/matriculas`: `users.is_admin`, `AdminGuard` responde 404 a quien no es admin. Se otorga solo con `npm run admin:grant -- <email>`. CLI de respaldo: `npm run verification:review`.
  - `/admin/usuarios` (`backend/README.md` → "Usuarios"): buscar cuentas, "Dar de baja" (= baja de cuenta, anonimiza) o "Borrar definitivamente" (cuentas de prueba: DELETE + CASCADE, confirma con el email, borra Cloudinary y recalcula ratings). Nunca a uno mismo ni a otro admin. Secciones del panel: un solo `AdminHeader`.
- Reseñas y reputación reales: el cliente reseña un trabajo `COMPLETED` (una por trabajo, regla `reviewBlocker`); rating/cantidad en perfil, resultados y presupuestos (`README.md` → "Reseñas y reputación").
  - Reseñas por invitación (`backend/src/reviews/invited-review.ts`, única regla): un enlace/QR **fijo** por profesional (`/p/:slug/resenar`, componente `review-invite`); el cliente **no necesita cuenta**: puntúa en una pantalla (`invited-review-page`) con nombre de pila + correo privado (sin verificar; `guest-review`) o, con sesión, sin pedir nada. Se muestran aparte ("Clientes invitados") y **nunca** entran en rating, cantidad, distribución ni orden; una por persona (cuenta o correo) y profesional, tope 20 en 30 días, el profesional no las borra. Contrató por Resuelve → va por el trabajo. Reportar: cualquier cuenta, "Reportar" en el perfil; lo resuelve una persona en `/admin/reportes` (panel admin, mismo servicio) o con `npm run reviews:moderation` (oculta = no se muestra ni cuenta, pero conserva el lugar; el profesional nunca las borra).
- Registro simple: `EMAIL_VERIFICATION_ENABLED` (default false) → `POST /auth/register` crea la cuenta y devuelve tokens; con el flag apagado el front no pide código. El registro pendiente con código (`pending_registrations`, `/auth/register/verify`) y `EmailVerifiedGuard` quedan en el backend detrás del flag; el front ya maneja el registro pendiente (`register-page` → `/verificar-email`), así que reactivarlo es `EMAIL_VERIFICATION_ENABLED=true` con un SMTP que funcione (Gmail). Una cuenta anterior sin verificar que crea su perfil profesional recibe 403 `EMAIL_NOT_VERIFIED` y el alta la manda a `/verificar-email`.
- Billing PRO real con Mercado Pago (`backend/src/billing/`, `backend/README.md` → "Billing PRO con Mercado Pago"):
  - preapproval SIN plan; `external_reference` = id interno; el frontend navega solo al `init_point` y nunca manda precio ni habla con MP;
  - webhook con firma obligatoria (validador del SDK oficial) = aviso: la verdad sale de un GET fresco al proveedor; idempotente y sin degradar por avisos viejos. Volver del checkout NUNCA activa PRO (`/pro/plan/resultado` consulta el status, máx. 30 s);
  - PRO manual (`plan_tier`) y PRO pago (`billing_pro_until`, derivado en `billing-rules.ts`) conviven: `planSource`/`effectivePlan`/`EFFECTIVE_PRO_SQL` son la única fuente; un webhook nunca baja un PRO manual;
  - precio de PRO administrable en `/admin/precio` (`GET/PUT /admin/pricing`, historial en `pro_price_changes`, `proMonthlyPrice` única fuente; sin cambios rige `PRO_MONTHLY_PRICE_ARS`): rige solo para suscripciones nuevas, las existentes conservan su monto. Los Términos no fijan el monto: remiten a la sección Plan;
  - promo `PRO_FIRST_MONTH_20`: $12.000 al crear (20% sobre el precio vigente), se consume con el primer cobro aprobado y recién ahí `PUT` a $15.000 (con lock; si falla queda pendiente y reintentable);
  - PAST_DUE con `BILLING_GRACE_DAYS` (10) de PRO; PAUSED = Free. Nunca se borran datos;
  - cancelar = cancelar la renovación: reconcilia antes, `paidThrough` (último cobro o autorización → próximo cobro, acotado a un ciclo) → `access_until`, PRO por fecha hasta ahí. Webhook/job nunca lo pisan. `/pro/plan` = "Mi plan" (gestión, siempre en el sidebar);
  - reconciliación: status (PENDING), job horario y `npm run billing:reconcile`. Tests siempre con `FakeBillingProvider` (`BILLING_PROVIDER=fake` también sirve un checkout falso para dev/Playwright); la env impide MP real en tests.
- Fase 8 (hardening, `docs/resuelve-pro-2-fase-8.md`): sin features nuevas. SEO por `data.seo` (solo lo declarado es indexable; el resto `noindex`), 404 real, sitemap/robots dinámicos en Vercel, perfil pausado = `noindex`. Backend: límites `THROTTLE_CREATE_LIMIT`/`THROTTLE_WRITE_LIMIT`, `X-Request-Id` en logs/errores, `/health/live`, índice `jobs(client_id,status)`, `npm run launch:audit` (solo lectura). No hay Fase 9: lanzar, medir y decidir con datos.
- Login: `returnUrl` seguro > `/pro/dashboard` si tiene perfil profesional > `/perfil`.
- "Tu mes" real (`GET /pro/analytics/month`, SQL por profesional, mes de Argentina) y Free/PRO real (`backend/README.md` → "Planes, entitlements y destacados"):
  - plan efectivo con `plan_expires_at`; la UI pregunta por entitlements (`canSendUnlimitedQuotes`, `canBeFeatured`, `canUseAdvancedAnalytics`, `canSeeExposureAnalytics`…), nunca por el tier;
  - Free post-primer-éxito: recibir solicitudes sin límite, **5 oportunidades discovery distintas respondidas en total** (`quote_quota_usages`, lock en el perfil, `FREE_QUOTE_LIMIT_REACHED`); PRO $15.000/mes sin límite.
  - `FIRST_SUCCESS_TRIAL`: mientras `first_success_at` sea null, respuestas ilimitadas para conseguir el primer cliente; no da badge PRO público, destacados ni analytics avanzados. El primer quote aceptado fija la fecha una vez; al terminar entra a Free en 0/5 (el contador no se reinicia por mes).
  - PRO manual solo por `npm run plan:set` (sin endpoint); badge "PRO" = PRO vigente (manual o pago), distinto de matrícula;
  - "Destacado" en búsqueda: solo PRO que cumple todas las reglas, rotulado, rotando y sin enterrar a Free;
  - exposición anónima (`exposure_events`: apariciones con IntersectionObserver y visitas al perfil, deduplicadas) → "Tu presencia en Resuelve" y embudo en Tu mes PRO. Nunca "quién vio tu perfil";
  - elegibilidad para destacados (`featuredIneligibility`, también en la vitrina del inicio y `/pro/me` → `featured`): PRO + activo + servicio público + cobertura. "Destacado" solo con elegibilidad real;
  - "Quiero PRO" sin checkout (solo con `BILLING_PROVIDER=none`): `POST /pro/plan/interest` registra el pedido (no cambia el plan). Upsells solo en contexto de cupo, Mi Plan Free y Mi perfil; ejemplos comerciales en Plan siempre rotulados "Ejemplo".
  - Oferta de bienvenida `PRO_FIRST_MONTH_20` (`plans/pro-offers.ts`, única fuente, `PRO_INTRO_OFFER_*`): Free al umbral efectivo (config acotada al cupo, hoy 5/5) o reservada al pedir PRO + nunca pagó PRO + no usada. Viaja en `/pro/me` y en el 403; una sola vez, sin timers.

- PRO 2.0 (por fases, `backend/README.md` → "Embudo del profesional"):
  - Fase 0: `first_success_at` = primer presupuesto aceptado (una vez, inmutable); `pro_funnel_events` con `recordFunnelEvent` dentro de la transacción de la acción (dedupe único; frontend solo `PRO_PLAN_VIEWED`/`PRO_CTA_CLICKED` vía `FunnelTracker`). Reporte: `npm run funnel:report`.

- PWA (`README.md` → "PWA"): `@angular/service-worker` + `public/manifest.webmanifest` (uno de cada). El SW NUNCA cachea la API (`dataGroups` vacío); navegación `freshness` con `index.csr.html` offline. `PwaInstall` = única fuente de "¿se puede instalar?" (sin prompt automático, sugerencia solo con uso real y fuera de formularios/checkout, "Ahora no" 7 días, iOS con instrucciones). `PwaUpdate` nunca recarga solo. "Sin conexión" con Reintentar, sin datos inventados. Logo = ícono de la app (`logo-96.png`).
- Dictado por voz: un solo `SpeechInput` (Web Speech API del navegador, es-AR; sin soporte no se ofrece, nunca se simula). Hoy en el inicio y en el presupuesto ("Qué vas a hacer" y "Aclaraciones"). Resuelve no recibe audio, solo el texto; está en la Política de Privacidad (`#dictado`).
- Agenda: tokens `agenda-*` (sin hex), color por estado, `HOUR_HEIGHT`/`WORKDAY_START`/`WORKDAY_END` únicos en `pro-agenda-page.ts`.
- Términos de Uso públicos (`/terminos`, prerender): describen solo lo que el código hace (Resuelve intermedia, no cobra el trabajo; PRO $15.000, promo $12.000 → $15.000, renovación, cancelar = no renovar, arrepentimiento aparte). Datos publicados: Francisco Larrosa, CUIT 20-39550730-4, domicilio en Tandil. No habilitar email de contacto hasta que exista una casilla oficial; el componente conserva un TODO. El alta guarda `users.terms_version`/`terms_accepted_at` (`CURRENT_TERMS_VERSION` = `TERMS_VERSION` del front). Si cambia una regla que describen, actualizarlos (`README.md` → "Privacidad, legal y favicon").
- Política de Privacidad pública (`/privacidad`, prerender): describe solo lo que el código hace; publica a Francisco Larrosa y el domicilio en Tandil, con fecha 28 de septiembre de 2026. No habilitar email de privacidad hasta que exista una casilla oficial; el componente conserva un TODO. Enlace en el pie del área cliente y en el registro (sin checkbox). Si cambia un tratamiento de datos, actualizarla (`README.md` → "Privacidad, legal y favicon").

## Reglas

- **Marca:** usar el manual `RESUELVE_MANUAL_DE_MARCA_V1.md`.
  - Tipografías: Source Serif 4 en H1/H2, Archivo en la UI.
  - Colores: tokens Cream/Forest/Terracotta de `src/styles.css`.
  - Pocas cards y nada de datos inventados.
- **Migraciones:** siempre nuevas; nunca `synchronize` ni editar la inicial. Probar apply → revert → apply.
- **Deploys y configuración:** no deployar ni cambiar la configuración de Render o Vercel. No commitear secretos. No poner identificadores de modelo en commits.
- **Git:**
  - Trabajar en `claude/new-session-55lgow`, recreada desde `origin/main` si el PR anterior ya se mergeó.
  - Hacer PR y merge solo cuando se pida.
- **Validación antes de entregar:**
  - Backend: `npm test` en `backend/` (e2e con `--runInBand`, Postgres local en el puerto 5433, `TEST_DATABASE_URL` en `.env`), `npm run lint` y `npm run typecheck`.
  - Frontend: `npx ng test --watch=false` y `npx ng build`, con Node 24 (`/opt/node24/bin`; Angular CLI 22 no corre con 22.22.2).
  - Manual: Playwright a 1440, 1024 y 390, con axe limpio, consola limpia y sin scroll horizontal.
- **Comunicación:** responder en español.
