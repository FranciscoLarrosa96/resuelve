# Resuelve API

Backend MVP de Resuelve: NestJS + TypeScript + PostgreSQL (TypeORM, migraciones reales), REST bajo `/api/v1`, documentación OpenAPI en `/api/docs`.

El frontend Angular vive en la raíz del repo. El alta profesional, el catálogo, las solicitudes y los presupuestos usan esta API; algunas pantallas de gestión siguen marcadas como demostración.

---

## Requisitos

- Node.js 20 o superior (probado con 24)
- PostgreSQL 13 o superior (usa `gen_random_uuid()`, que es nativo desde la 13; no requiere extensiones)
- npm

## Instalación

```bash
cd backend
npm ci
cp .env.example .env   # y completar los valores
```

## Variables de entorno

| Variable | Obligatoria | Descripción |
|---|---|---|
| `NODE_ENV` | no | `development` · `production` · `test` |
| `PORT` | no | Puerto HTTP (Render lo inyecta). Default `3000` |
| `DATABASE_URL` | **sí** | `postgres://usuario:clave@host:5432/base` |
| `DATABASE_SSL` | no | `true` si la conexión exige TLS (URL externa de Render, la mayoría de los hostings) |
| `JWT_ACCESS_SECRET` | **sí** | ≥ 32 caracteres, aleatorio |
| `JWT_REFRESH_SECRET` | **sí** | ≥ 32 caracteres, aleatorio y **distinto** del anterior |
| `JWT_ACCESS_EXPIRES_IN` | no | Default `15m` |
| `JWT_REFRESH_EXPIRES_IN` | no | Default `30d` |
| `FRONTEND_URL` | no | Orígenes permitidos por CORS, separados por coma. El primero es el canónico para enlaces (emails, retorno del pago) |
| `LOG_LEVEL` | no | `info` por defecto |
| `THROTTLE_LIMIT` | no | Pedidos por minuto y por IP (global). Default `120` |
| `THROTTLE_AUTH_LIMIT` | no | Límite de `/auth/login` y `/auth/register` por minuto e IP. Default `10` |
| `THROTTLE_VERIFICATION_LIMIT` | no | Firmas de subida y envíos de matrícula por minuto e IP. Default `10` |
| `CLOUDINARY_CLOUD_NAME` · `CLOUDINARY_API_KEY` · `CLOUDINARY_API_SECRET` | no | Almacenamiento **privado** del documento opcional de matrícula. Sin las tres, solo se puede enviar el número (la subida responde `503 UPLOADS_NOT_CONFIGURED`). El secret nunca sale del backend |
| `CLOUDINARY_API_BASE` | no | Solo pruebas locales contra un doble del proveedor. En producción, vacía |
| `CLOUDINARY_URL` | no | Alternativa a las tres anteriores: `cloudinary://<key>:<secret>@<cloud>` (lo que muestra el panel). Las sueltas tienen prioridad. Los valores se limpian de espacios, saltos de línea y comillas |
| `CLOUDINARY_SIGNATURE_ALGORITHM` | no | `sha1` (default) o `sha256`: tiene que coincidir con Settings → Security → "Signature algorithm" de la cuenta |
| `LOCATION_PROVIDER` | no | Direcciones de "¿Dónde es el trabajo?": `none` (default: dirección a mano + barrios) o `google` (Places Autocomplete New + Geocoding) |
| `GOOGLE_MAPS_API_KEY` | no | Solo con `LOCATION_PROVIDER=google`. Nunca llega al frontend: restringila por API (Places, Geocoding) y por IP del backend |
| `THROTTLE_LOCATION_LIMIT` | no | Consultas a `/location/*` por minuto e IP (cada una cuesta en el proveedor). Default `30` |
| `FREE_QUOTE_LIMIT` | no | Oportunidades discovery distintas que Free post-trial puede responder en total. Default `3` (`0` = sin límite); `FREE_MONTHLY_QUOTE_LIMIT` queda como fallback temporal |
| `FIRST_SUCCESS_TRIAL_ENABLED` | no | Trial de respuestas ilimitadas hasta el primer quote aceptado. Default `true` |
| `PRO_EARLY_OPPORTUNITIES` | no | PRO y FIRST_SUCCESS_TRIAL reciben discovery al entregarse; Free espera la demora configurable solo si un PRO del mismo pedido la tuvo antes. Default `true` |
| `FREE_OPPORTUNITY_DELAY_MINUTES` | no | Ventana de ventaja de un PRO sobre un Free post-éxito **del mismo pedido**, en minutos. Default `30` (el default del código, no necesariamente lo configurado en producción). Solo se aplica a pedidos normales con un PRO elegible delante: no afecta `targeted`, hoy ni urgente. `URGENT_FREE_OPPORTUNITY_DELAY_MINUTES` ya no tiene efecto (se acepta para no romper entornos que la tienen) |
| `MAX_ACTIVE_QUOTES_PER_REQUEST` | no | Presupuestos PENDING vigentes y ACCEPTED que ocupan cupo por solicitud. Default `5` |
| `PRO_ATTRIBUTION` | no | Persiste el origen de invitaciones y permite atribución destacada verificada. Default `true` |
| `FIRST_SUCCESS_TRIAL_MAX_DAYS` / `FIRST_SUCCESS_TRIAL_MAX_OPPORTUNITIES` | no | Safety valves preparadas; vacías = sin límite actual |
| `FEATURED_SLOTS` | no | Máximo de espacios "Destacado" por búsqueda (0–5). Default `2` (`0` los apaga) |
| `FEATURED_RESULTS_PER_SLOT` | no | Resultados necesarios por cada espacio destacado. Default `8` |
| `PRO_MONTHLY_PRICE_ARS` | no | Precio mensual de PRO en pesos (lo cobra Mercado Pago con `BILLING_PROVIDER=mercadopago`). Default `15000` |
| `PRO_INTRO_OFFER_ENABLED` | no | Oferta de bienvenida de PRO. Default `true` (`false` la apaga en todos lados) |
| `PRO_INTRO_OFFER_CODE` | no | Código estable de la oferta (`A-Z`, `0-9`, `_`). Default `PRO_FIRST_MONTH_20` |
| `PRO_INTRO_OFFER_DISCOUNT_PERCENT` | no | Descuento (1–90). Default `20` |
| `PRO_INTRO_OFFER_CYCLES` | no | Meses con descuento (1–12). Default `1` |
| `PRO_INTRO_OFFER_MIN_FREE_USAGE` | no | Oportunidades Free totales desde las que se ofrece (se acota al cupo). Default `9` |
| `THROTTLE_EVENTS_LIMIT` | no | Tandas de `POST /analytics/events` por minuto e IP. Default `30` |
| `TEST_DATABASE_URL` | solo tests | Base **descartable** para los tests e2e (se borra en cada corrida) |

Generar un secreto:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

La app valida la configuración al arrancar: si falta algo, no levanta y dice qué falta.

## Conectar PostgreSQL local

Compose mantiene bases separadas para la app local y para e2e. La base de desarrollo persiste los registros y no la toca el runner de e2e. Desde la raíz:

```bash
docker-compose up -d postgres
docker-compose --profile test up -d postgres-test
```

En `backend/.env` (creado desde `.env.example`), usar URLs distintas:

```dotenv
DATABASE_URL=postgresql://resuelve:resuelve_local@localhost:5434/resuelve_local
DATABASE_SSL=false
TEST_DATABASE_URL=postgresql://resuelve:resuelve_local@localhost:5433/resuelve_test
```

Después de que el contenedor esté healthy, las migraciones reales se aplican con `npm run migration:run` desde `backend/`. Los e2e cargan `TEST_DATABASE_URL` desde `backend/.env`, borran y recrean ese esquema y vuelven a aplicar las migraciones antes del seed. El harness bloquea la conexión antes de empezar si el host no es loopback o el nombre de la base no contiene `test` o `e2e`; nunca apuntar esa URL a producción.

`docker-compose down` detiene los contenedores y conserva los volúmenes. El puerto `5434` es para desarrollo y `5433` para e2e; ambos evitan interferir con PostgreSQL local en `5432`.

También se puede usar cualquier PostgreSQL 13+ instalado localmente si se configuran bases separadas para desarrollo y tests.

## Desarrollo

```bash
npm run migration:run   # crea el esquema
npm run seed            # datos de prueba
npm run start:dev       # http://localhost:3000/api/v1 · docs en http://localhost:3000/api/docs
```

Cuentas del seed (contraseña `resuelve-dev-2026`):

- Clientes: `maria@resuelve.dev` (solicitudes en distintos estados), `mariana.lopez@resuelve.dev`, `diego.romero@resuelve.dev`, `silvia.molina@resuelve.dev`
- Profesionales PRO de cortesía: `carlos@resuelve.dev`, `juan@resuelve.dev`, `martin@resuelve.dev`
- Profesionales Free: `hernan@resuelve.dev`, `luciano@resuelve.dev`, `nicolas@resuelve.dev`, y el resto de `PROFESSIONALS`

En local, el alta por `/registro` inicia sesión directamente: `EMAIL_VERIFICATION_ENABLED=false` (valor por defecto) evita depender de SMTP. El seed es solo para desarrollo y e2e; nunca se ejecuta en producción.

## Migraciones

`synchronize` está **siempre apagado**: el esquema solo cambia con migraciones.

```bash
npm run migration:generate -- src/database/migrations/NombreDelCambio   # a partir de las entidades
npm run migration:create -- src/database/migrations/NombreDelCambio     # migración vacía
npm run migration:run
npm run migration:revert
npm run migration:show
npm run migration:run:prod    # sobre el build compilado (dist/), para Render
```

La migración inicial (`InitialSchema`) incluye además dos índices que TypeORM no genera solo:

- `uq_users_email_lower`: email único sin importar mayúsculas.
- `uq_quotes_active_per_professional`: índice único parcial; un profesional no puede tener dos presupuestos activos (`PENDING`/`ACCEPTED`) en la misma solicitud.

`AppointmentsAgenda` (coordinación y agenda) recrea los enums `request_status` (suma `COMPLETED`; `AWAITING_REVIEW` → `COMPLETED`) y `appointment_status` (`SCHEDULED`/`IN_PROGRESS` → `CONFIRMED`) pasando la columna por `text`, así los valores nuevos se usan en la misma transacción. El `down` vuelve al modelo anterior (una cita por solicitud: conserva la más reciente).

`NotificationsCompletion` crea `notifications` (enum `notification_type`, `dedupe_key` único, índice parcial de no leídas) y suma `service_requests.completed_by` (reusa `appointment_party`; los trabajos ya completados quedan `PROFESSIONAL`, que era el único que podía cerrarlos). El `down` borra ambas cosas.

`PlansAnalytics` suma `professional_profiles.plan_expires_at` y `quotes.accepted_at` (los aceptados existentes toman `updated_at`) e índices por profesional + fecha para "Tu mes" (`request_invitations.sent_at`, `quotes.created_at`/`accepted_at`, `service_requests.completed_at`). El `down` los borra.

## Catálogo productivo: `npm run seed:catalog`

Carga **solo datos de referencia reales**: la ciudad (Tandil, Buenos Aires), sus barrios, las categorías y los servicios. No crea usuarios, profesionales, pedidos, presupuestos, reseñas, ratings ni turnos.

```bash
npm run build          # si todavía no está compilado (en Render ya lo está)
npm run seed:catalog   # usa DATABASE_URL; requiere las migraciones aplicadas
npm run seed:catalog:dev   # lo mismo sin compilar (ts-node), para desarrollo local
```

**Es seguro correrlo en producción, y las veces que haga falta:**

- Upsert por slug (`INSERT … ON CONFLICT … DO UPDATE`) sobre los índices únicos de la migración inicial. Ejecutarlo dos veces no duplica nada ni cambia ids (hay tests que lo prueban contra PostgreSQL real).
- Todo corre en una transacción: o se aplica completo o no se aplica nada.
- Actualiza nombre, orden, categoría y `requiresLicense` para que coincidan con el catálogo del código. **No** reactiva lo que se haya desactivado a mano (`active = false`) y **no** borra registros que no estén en la lista.
- Si hay migraciones pendientes, se detiene sin tocar nada.
- No depende de `NODE_ENV` ni lo modifica.

La fuente es `src/database/catalog/catalog.data.ts`. Para sumar un servicio, barrio o ciudad: agregarlo ahí con un slug nuevo y volver a correr el script. Los slugs son la clave: se puede cambiar el nombre visible, pero no el slug (eso crearía otro registro). Para dar de baja un barrio sin borrar historial: `active: false` en los datos.

**Barrios de Tandil: dataset pendiente.** Hoy hay 5 barrios. No hay en el repo una lista oficial/aprobada y no se inventan nombres: para ampliar el catálogo hace falta una fuente (p. ej. el listado del Municipio de Tandil) y documentarla en este archivo junto al cambio.

Contenido actual: 1 ciudad, 5 barrios de Tandil (los mismos que usa el frontend), 4 categorías y 20 servicios. Requieren matrícula (`requiresLicense = true`) Gas y Electricidad, igual que en el resto del sistema; el resto, no.

En Render (una vez, después del deploy con migraciones): abrir el **Shell** del Web Service y correr `npm run seed:catalog`. Después, `GET /api/v1/categories` devuelve el catálogo.

## Alta profesional desde una cuenta real

El onboarding usa la misma cuenta autenticada; no necesita fixture ni SQL manual:

1. `GET /api/v1/auth/me` devuelve `professionalProfileId` (`null` antes del alta).
2. `GET /api/v1/categories` agrupa los servicios activos e indica `requiresLicense`; `GET /api/v1/zones?city=tandil` devuelve las zonas activas.
3. `POST /api/v1/pro/profile` con Bearer token publica el perfil. Requiere `headline` con texto, al menos un `serviceId` (o un oficio sugerido pendiente) y cobertura: `coversEntireCity: true` (todo Tandil) o al menos un `zoneId` válido. Acepta `bio`, `availableToday` y `yearsExperience` (0–70) opcionales: sin dato queda NULL = no informado (no 0 años; `PATCH /pro/profile` con `yearsExperience: null` lo borra; la migración `ProfileYearsExperienceNullable` no cambia valores existentes). Perfil, asociaciones y disponibilidad se guardan en una transacción.
4. `GET /api/v1/auth/me` devuelve el nuevo `professionalProfileId`; `GET /api/v1/pro/me` devuelve servicios, zonas, disponibilidad y solicitudes de verificación propias. `GET /api/v1/professionals/:id` y la búsqueda pública muestran el perfil inmediatamente.

Solo puede existir un perfil por usuario. Una segunda alta responde `409 PROFESSIONAL_PROFILE_EXISTS`; el cliente debe abrir el panel o usar `PATCH /api/v1/pro/profile` para editar. `PATCH /api/v1/pro/availability` prende o apaga “Atiendo urgencias”, una preferencia permanente (no vence). No hay estado de borrador o publicación: el `POST` publica directamente. `requiresLicense` indica que el servicio requiere matrícula: el perfil se publica igual, pero ese servicio no aparece en búsquedas ni en la ficha pública hasta que su matrícula `LICENSE` esté aprobada y vigente (ver "Núcleo profesional").

### Especialidades propias

`CreateProfessionalProfileDto` y `UpdateProfessionalProfileDto` aceptan `specialties: [{ serviceId, names: string[] }]`. Cada rubro debe estar entre los servicios ofrecidos; hasta 5 nombres de 2–60 caracteres por rubro, sin duplicados (ignora acentos/caja), teléfonos, emails o enlaces. Regla única `service-specialties.ts`; migración nueva `ServiceSpecialties1795200000000` (`professional_services.specialties text[]`).

Cada entrada reemplaza las especialidades de ese rubro (`names: []` las quita); omitir un rubro conserva sus nombres mientras siga ofreciéndose. Quitar el rubro quita sus especialidades. Las escrituras se serializan con el lock del perfil. El presenter las entrega en `services`/`offeredServices`, para Free y PRO. No se agregan filas al catálogo ni cambia elegibilidad, búsqueda o matrícula. La baja de cuenta limpia este texto público.

## Profesionales de prueba: `npm run fixture:test-pros`

Para validar la integración con datos reales sin el seed de desarrollo. `create` usa solo la API pública, igual que una persona: `POST /auth/register` (o `/auth/login` si ya existe), `POST /pro/profile` y `PATCH /pro/availability`. No escribe SQL, así que no inventa métricas, verificaciones, reseñas ni portfolio. Crea como máximo 2 perfiles, claramente de prueba: "Profesional de prueba 1/2", con emails `@resuelve.test` (dominio reservado) y sin teléfono.

```bash
npm run build
TEST_PRO_PASSWORD='una-clave-larga' npm run fixture:test-pros -- create --api <API>/api/v1 [--count 2]
npm run fixture:test-pros -- remove   # usa DATABASE_URL; borra solo esas cuentas (cascada)
```

`create` es idempotente: correrlo de nuevo actualiza los perfiles y su "Atiendo urgencias". La contraseña no se guarda en ningún lado.

## Seed de desarrollo

```bash
npm run seed                   # carga datos si la base está vacía
SEED_RESET=true npm run seed   # vacía todas las tablas y recarga
```

**Nunca en producción**: se niega a correr con `NODE_ENV=production`. Usa el mismo catálogo que `seed:catalog` y le suma datos ficticios: la clienta María, 13 profesionales (con servicios, zonas, verificaciones y portfolio) y solicitudes en curso. Las métricas (rating, reseñas, trabajos) **no se inventan**: el seed crea trabajos cerrados con reseñas reales y las métricas se calculan a partir de esas filas, igual que en producción. Las fotos son URLs mock (`picsum.photos`); no depende de randomuser.

## Tests

```bash
npm test             # unit + e2e
npm run test:unit    # reglas puras, sin base de datos
npm run test:e2e     # API completa contra PostgreSQL real (requiere TEST_DATABASE_URL)
```

Los e2e borran y recrean el esquema de `TEST_DATABASE_URL`, corren las migraciones reales y el seed. Sin esa variable, se saltean (no simulan una base). Corren en serie (`--runInBand`) porque comparten esa base.

Qué cubren:

| Área | Casos |
|---|---|
| Auth | registro, login, password incorrecta (mismo error que email inexistente), email duplicado sin importar mayúsculas, rotación de refresh token, reintento dentro de la ventana de gracia, dos refresh simultáneos, reuso real fuera de la ventana, familia cerrada (logout/robo), logout, tokens hasheados |
| Solicitudes | el cliente solo ve y edita las suyas; máximo 3 invitados; elegibilidad (servicio, urgencias) |
| Presupuestos | solo cotiza quien fue invitado; no dos activos del mismo profesional; totales calculados en el servidor; edición |
| Aceptar | solo el dueño; una sola quote gana; aceptaciones concurrentes (solo una gana) |
| Elegibilidad | solo Centro vs. Villa Italia, "Todo Tandil", pausado, servicio no ofrecido, Gas pendiente/aprobada; el presupuesto revalida (pausa, servicio) sin exigir cobertura |
| Citas | solo el elegido propone (perdedor 404), una activa por solicitud, cambiar propuesta con historial, confirmar/rechazar idempotentes, dos pestañas, propuestas simultáneas, reprogramar, cancelar horario, cancelar solicitud cancela la cita, propuesta vencida |
| Conflictos | confirmadas superpuestas rechazadas; canceladas y otros profesionales no bloquean |
| Trabajo realizado | sin cita confirmada o antes del día no se completa; cliente/perdedor no pueden; `COMPLETED` en cita y solicitud; doble completado; no se reprograma después |
| Agenda | rango con hora de Argentina (22:30 cae en su día), solo propias, sin canceladas/rechazadas, sin contacto, realizados visibles, rango inválido |
| Reseñas | solo trabajo realizado, solo el cliente real (otro usuario, ganador y perdedor → 404), profesional derivado de la solicitud (body extra → 400), sin auto-reseña, ratings/HTML/longitud inválidos → 400, doble envío simultáneo → una sola, 5 + 3 → 4,0, `null` sin reseñas, DTO público sin datos privados, paginado, `minRating`, rating en presupuestos, no cambia el estado |
| Privacidad | el invitado no ve dirección ni teléfono; el elegido sí (y solo mientras el trabajo está activo) |
| Estados | transiciones imposibles rechazadas (unit + e2e) |
| Perfil pro | no acepta métricas del cliente; nadie se verifica a sí mismo |
| Oferta PRO (`PRO_FIRST_MONTH_20`) | (con el cupo de 5 que fija el harness de tests) 4/5 no, 5/5 sí; el 403 del cupo trae la oferta; montos del servidor; embudo deduplicado y solo con elegibilidad (REDEEMED o montos desde el cliente → 400); reservarla mantiene la elegibilidad; redimida → no vuelve; dos redenciones simultáneas → una; PRO vigente sin oferta |
| Catálogo (`seed:catalog`) | la primera ejecución crea el catálogo y nada más; la segunda no duplica ni cambia ids; servicios asociados a su categoría; zonas asociadas a Tandil; no reactiva lo desactivado a mano |

## Build y producción

```bash
npm run build          # compila a dist/
npm run start:prod     # node dist/main.js (escucha en 0.0.0.0:$PORT)
```

## Swagger / OpenAPI

- UI: `GET /api/docs`
- JSON: `GET /api/docs/openapi.json`

Para probar endpoints privados: `POST /api/v1/auth/login` → copiar `accessToken` → botón **Authorize**.

---

## Arquitectura

```text
src/
  main.ts, app.module.ts, app.setup.ts   arranque, seguridad, validación, Swagger (app.setup lo comparten main y los tests)
  config/          validación de variables de entorno
  common/          errores con código, filtro de excepciones, dinero, paginación, guards de auth, zona horaria
  database/        opciones de TypeORM, data source del CLI, naming snake_case, migraciones, catálogo productivo (catalog/) y seed de desarrollo (seeds/)
  health/          GET /health
  auth/            registro, login, refresh con rotación, logout
  users/           entidad User, /auth/me
  catalog/         categorías, servicios, ciudades, zonas
  professionals/   perfil profesional, servicios/zonas, verificaciones, portfolio, búsqueda
  requests/        solicitudes, fotos, invitaciones, máquina de estados, presenter con reglas de privacidad
  quotes/          presupuestos, ítems, cálculo de totales, aceptación transaccional
  appointments/    turnos
  reviews/         reseñas y recálculo de métricas
```

Cada módulo tiene controller (HTTP + Swagger), service (reglas de negocio) y, donde importa, un *presenter* que decide qué campos salen de la API. Las reglas puras (estados, totales, privacidad, elegibilidad de reseñas) están en funciones sin dependencias y tienen tests unitarios.

## Modelo de datos

```text
User ─1:0..1─ ProfessionalProfile ─N:M─ Service (ProfessionalService)
                                  ─N:M─ Zone    (ProfessionalServiceArea)
                                  ─1:N─ ProfessionalVerification (IDENTITY | PHONE | LICENSE; PENDING | VERIFIED | REJECTED)
                                  ─1:N─ ProfessionalWork (Free 1 / PRO 10, "Trabajos realizados") ─1:N─ ProfessionalWorkPhoto (máx. 5)
City ─1:N─ Zone          Category ─1:N─ Service
User(cliente) ─1:N─ ServiceRequest ─1:N─ RequestPhoto
                                   ─1:N─ RequestInvitation (máx. 6, `MAX_INVITATIONS_PER_REQUEST`) ─ ProfessionalProfile
                                   ─1:N─ Quote ─1:N─ QuoteItem
                                   ─1:N─ Appointment (historial; máx. 1 activa)
                                   ─1:0..1─ Review
User ─1:N─ Notification (solo referencias: solicitud, presupuesto o cita)
User ─1:N─ RefreshToken (hash SHA-256, rotación)
```

- **Una sola cuenta** por persona: el `User` es cliente y, opcionalmente, tiene un `ProfessionalProfile` ("Modo profesional"). No hay roles excluyentes.
- **Términos de Uso aceptados** (migración `TermsAcceptance`): el alta (con o sin verificación de email) guarda `users.terms_version` = `CURRENT_TERMS_VERSION` (`src/legal/terms.ts`, igual a `TERMS_VERSION` de `/terminos` en el frontend) y `users.terms_accepted_at`. Cuentas anteriores quedan en `null` (no se inventa una aceptación). No viaja en la API; cambio material de los Términos → nueva versión (fecha).
- **Servicios en la base**, no en enums.
- **Geografía simple**: `City` (con provincia como texto) y `Zone`. Sumar Azul u Olavarría es cargar filas.
- **Dinero** en `numeric(12,2)`. Se lee como string (nunca float), se calcula en centavos enteros y la API lo devuelve como `"52000.00"`.
- Todos los `id` son UUID; las fechas, `timestamptz`.

### Estados de una solicitud

```text
DRAFT → WAITING_QUOTES → QUOTES_RECEIVED → PROFESSIONAL_SELECTED ⇄ SCHEDULED → COMPLETED
                         (vuelve a WAITING_QUOTES      (cita confirmada ⇄ cancelada/reprogramada)
                          si se retira la única quote)
Cualquier estado previo al trabajo realizado → CANCELLED
```

| Backend | Frontend ("Mis solicitudes") |
|---|---|
| `WAITING_QUOTES` | Esperando presupuestos |
| `QUOTES_RECEIVED` | Presupuestos recibidos |
| `PROFESSIONAL_SELECTED` | Profesional seleccionado (coordinando fecha) |
| `SCHEDULED` | Trabajo agendado (hay una cita confirmada) · "Pendiente de confirmar" si su horario ya terminó |
| `COMPLETED` | Trabajo realizado |

El frontend muestra además un estado **contextual** derivado (no persistido): `PROFESSIONAL_SELECTED` con una cita `PROPOSED` → "Horario por confirmar"; `SCHEDULED` con el horario terminado → "Pendiente de confirmar".

- **`COMPLETED`** = el cliente dueño o el profesional elegido confirmó que el trabajo se realizó (`completed_by`: `CLIENT`/`PROFESSIONAL`, trazabilidad interna, no se publica). No significa reseña hecha, pago confirmado ni conformidad del cliente. No depende de una reseña: la reseña es posterior y opcional, y **no cambia el estado**. El paso del tiempo nunca completa un trabajo.
- **`AWAITING_REVIEW` (legacy)**: ya no se escribe. La migración `AppointmentsAgenda` pasó esas filas a `COMPLETED`. Se deja en el enum para no romper datos ni despliegues.
- **`CLOSED` (legacy)**: era "terminado y reseñado". Ya no se escribe (una reseña no cierra nada); las filas existentes se leen como trabajo realizado.

Cualquier transición fuera de la tabla responde `409 INVALID_REQUEST_STATE`.

Urgencia: `FLEXIBLE` ("Puede esperar"), `TODAY` ("Para hoy"), `URGENT`. Una urgencia es una solicitud más; la regla extra es que solo se puede invitar a profesionales que toman urgencias ahora ("Atiendo urgencias", `isTakingUrgencies`).

## Endpoints

Prefijo `/api/v1`. 🔓 = público; el resto requiere `Authorization: Bearer <accessToken>`; 🛠 = requiere perfil profesional.

| Método | Ruta | |
|---|---|---|
| GET | `/health` 🔓 | Estado de la API y la base |
| POST | `/auth/register` 🔓 | Crea la cuenta y devuelve tokens |
| POST | `/auth/login` 🔓 | |
| POST | `/auth/refresh` 🔓 | Rota el refresh token |
| POST | `/auth/logout` 🔓 | Revoca el refresh token |
| GET | `/auth/me` | Usuario actual (+ `professionalProfileId`) |
| GET | `/categories` 🔓 | Categorías con sus servicios |
| GET | `/services` 🔓 | `?category=slug&q=texto` |
| GET | `/services/:idOrSlug` 🔓 | |
| GET | `/provinces` 🔓 | Las 24 jurisdicciones con código oficial |
| GET | `/localities` 🔓 | `?search&province&limit` (máx. 20, sin tildes). Sin texto: localidades con profesionales |
| GET | `/localities/:id` 🔓 · `/provinces/:p/localities/:l` 🔓 | Detalle (`hasNeighborhoods`, `professionalsCount`, con `?service=` también `serviceProfessionalsCount`) |
| GET | `/localities/:id/neighborhoods` 🔓 | Barrios de la localidad (vacío = ciudad completa) |
| GET | `/localities/served` 🔓 · `/localities/served-services` 🔓 | Localidades (y pares localidad × servicio) con oferta real: SEO y sitemap |
| PUT | `/auth/me/locality` | Ciudad elegida de la cuenta (`{ localityId }`, `null` la borra) |
| GET | `/cities` 🔓 · `/zones` 🔓 | LEGACY: ciudades con barrios · `?locality=<id>` o `?city=slug` (slug ambiguo → 422 `AMBIGUOUS_LOCALITY`; sin ciudad → `[]`) |
| GET | `/professionals` 🔓 | `?locality&service&zone&availableToday&licenseVerified&minRating&page&pageSize` (service/zone aceptan id o slug; `locality` es id). Con `locality`, todo —destacados, urgencias, total y páginas— queda dentro de esa ciudad. Cada ítem trae `pro`, `isFeaturedPlacement`, `primaryLocality` y `coverage` |
| GET | `/plans` 🔓 | Condiciones configurables: cupo Free (`null` = sin límite), precio PRO, flags de funcionalidades en desarrollo y `introOffer { code, discountPercent, cycles, discountedPriceArs }` (`null` = apagada) |
| POST | `/analytics/events` 🔓 | Apariciones en búsquedas y visitas al perfil en tandas de hasta 50 (`{ sessionKey, events }`). Con sesión, la exposición propia no cuenta. Responde `{ accepted }` |
| GET | `/professionals/:id` 🔓 | Ficha pública + portfolio + primera página de reseñas + distribución de estrellas |
| GET | `/professionals/:id/reviews` 🔓 | Reseñas públicas paginadas `?page&pageSize&kind=verified\|invited` (más recientes primero; `verified` por defecto) |
| GET | `/professionals/:id/invited-review` | Si el usuario puede dejar una reseña por invitación o por qué no: `{ canReview, blocker, requestId, review }` |
| POST | `/professionals/:id/invited-review` | `{ rating 1–5, comment? }` (mismo DTO que la verificada). Reseña por invitación de alguien con cuenta |
| POST | `/professionals/:id/guest-review` 🔓 | Lo mismo SIN cuenta: `+ { name, email }`. Solo se publica el primer nombre; el correo es privado |
| POST | `/requests` | Crea en `DRAFT` |
| GET | `/requests/mine` | Paginado, `?status=` y/o `?group=ACTIVE\|QUOTES\|COORDINATING\|SCHEDULED\|DONE\|CANCELLED` |
| GET · PATCH | `/requests/:id` | Solo el dueño |
| POST | `/requests/:id/cancel` | |
| POST | `/requests/:id/invitations` | `{ professionalIds }`, máximo 3 en total |
| GET | `/requests/:id/quotes` | Presupuestos recibidos |
| POST | `/quotes/:id/accept` | Transaccional |
| POST | `/appointments/:id/confirm` | Cliente: confirma el horario propuesto → cita `CONFIRMED`, solicitud `SCHEDULED` |
| POST | `/appointments/:id/decline` | Cliente: "No puedo en ese horario" → cita `DECLINED` (sigue el mismo profesional) |
| POST | `/appointments/:id/cancel` | Cliente (cita confirmada) o profesional elegido (propuesta o confirmada): cancela el horario, no la solicitud |
| POST | `/requests/:id/complete` | Cliente dueño **o** profesional elegido, cita confirmada y horario terminado → cita y solicitud `COMPLETED` (idempotente). Devuelve la vista de quien actúa |
| GET | `/me/notifications/summary` | `{ client: { unread, completionDue }, professional: { unread, completionDue, requests: { total, PENDING, QUOTED, SELECTED }, agenda } \| null }` (novedades agrupadas por dónde está la acción) |
| GET | `/me/notifications` | `?audience=CLIENT\|PROFESSIONAL&unread=true`: últimas 50 (tipo, solicitud y su título; en presupuestos, quién lo mandó) |
| PATCH | `/me/notifications/read-by-request/:requestId` | `?audience=&section=REQUESTS\|AGENDA`: marca leídas las de esa solicitud y ese modo (y, con `section`, solo esa sección; 404 si no es tuya); devuelve el resumen |
| GET | `/location/config` 🔓 | `{ enabled }`: hay proveedor de direcciones configurado |
| POST | `/location/autocomplete` 🔓 | `{ query (≥ 3), sessionToken? }` → `{ items: [{ id, main, secondary }] }` (máx. 5, sesgado a Tandil). 503 `LOCATION_NOT_CONFIGURED` · 502 `LOCATION_PROVIDER_ERROR` |
| POST | `/location/resolve` 🔓 | `{ placeId }` o `{ address }` → `{ result: { address, formattedAddress, zone, outsideCity } \| null }` |
| POST | `/location/reverse` 🔓 | "Usar mi ubicación": `{ lat, lng }` → lo mismo. Las coordenadas no se guardan ni se devuelven |
| POST | `/reviews/:id/report` | `{ reason FAKE\|OFFENSIVE\|SPAM\|OTHER, details? ≤ 500 }`. Reporta una reseña visible (200 `{ reported: true }`, idempotente por persona y reseña; 404 si no existe u oculta; 409 si es la propia). No la oculta |
| POST | `/requests/:id/review` | `{ rating 1–5, comment? }` (texto plano, ≤ 1000). El profesional lo deriva el backend |
| POST | `/pro/profile` | Activa el modo profesional |
| GET | `/pro/me` 🛠 | Perfil propio: estado, servicios con estado de matrícula, zonas guardadas, verificaciones (sin documento ni revisor), plan con entitlements y `quoteUsage` Free acumulado, `featured { eligible, reason }` y `proInterestAt` |
| POST | `/pro/plan/interest` 🛠 | "Quiero PRO": registra el pedido (idempotente). No cambia el plan. Acepta solo `offerCode` (se reserva si hoy es elegible); cualquier monto → 400 |
| POST | `/pro/funnel-events` 🛠 | Embudo PRO que solo conoce el frontend: `{ type: PRO_PLAN_VIEWED \| PRO_CTA_CLICKED, surface }` → `{ recorded }`. Uno por superficie y día; el resto del embudo lo registra el servidor. Popup del primer presupuesto aceptado = `FIRST_SUCCESS`; las visitas explícitas a Mi plan son `PLAN_PAGE` y `funnel:report` separa todo por superficie. Referidos y PRO manual no generan `PRO_PAYMENT_APPROVED`, aviso de la última oportunidad Free = `LAST_FREE_OPPORTUNITY` (vista = `PRO_PLAN_VIEWED`, clic = `PRO_CTA_CLICKED`). Las reseñas invitadas nunca generan eventos del embudo, primer éxito ni consumo de cupo (test en `reviews.e2e-spec.ts`) |
| POST | `/pro/plan/offer-events` 🛠 | Embudo de la oferta: `{ type: SHOWN \| CLICKED, surface: REQUESTS_USAGE \| LIMIT_MODAL \| PLAN_PAGE, offerCode }` → `{ recorded }`. Deduplicado por día; ignorado si no es elegible |
| POST | `/billing/pro/checkout` 🛠 | Crea (o reutiliza) la suscripción PRO en Mercado Pago → `{ checkoutUrl, subscriptionId }`. Body opcional `{ returnTo }` (ruta interna). Precio y oferta los decide el backend. 409 `BILLING_ALREADY_SUBSCRIBED` \| `BILLING_MANUAL_PRO_ACTIVE`, 502 `BILLING_PROVIDER_ERROR`, 503 `BILLING_NOT_CONFIGURED` |
| GET | `/billing/pro/status` 🛠 | Plan efectivo, fuente, entitlements, suscripción (estado interno, próximo cobro, acceso, gracia, checkout pendiente), `canCheckout`, `checkoutPrice`, `hadSubscription` |
| GET | `/account/deletion-check` | Qué impide la baja de cuenta: `{ canDelete, blockers: [{ code, count, message }] }` |
| POST | `/account/delete` | Baja definitiva (anonimiza). Body `{ password }`. 403 `ACCOUNT_PASSWORD_INCORRECT`, 409 `ACCOUNT_DELETE_BLOCKED`, 502 `ACCOUNT_DELETE_FAILED`. Ver "Baja de cuenta" |
| POST | `/billing/pro/withdraw` 🛠 | **Botón de arrepentimiento**: revoca la contratación dentro de `BILLING_WITHDRAWAL_DAYS` (10) desde la autorización, cancela, quita PRO en el acto y reembolsa. Mismo cuerpo que `status`. 409 `BILLING_NO_SUBSCRIPTION` \| `BILLING_WITHDRAWAL_EXPIRED`, 502 `BILLING_PROVIDER_ERROR` |
| POST | `/billing/pro/cancel` 🛠 | Cancela la renovación en Mercado Pago; PRO hasta fin del período pago. 409 `BILLING_NO_SUBSCRIPTION` |
| POST | `/webhooks/mercado-pago/subscriptions` 🔓 | Avisos de Mercado Pago con firma `x-signature` obligatoria (401 si falla). Ver "Billing PRO con Mercado Pago" |
| PATCH | `/pro/profile` 🛠 | Titular, bio, experiencia, servicios, `coversEntireCity`, zonas |
| PATCH | `/pro/status` 🛠 | `{ status: ACTIVE \| PAUSED }` — pausar/reactivar el perfil |
| PATCH | `/pro/availability` 🛠 | `{ availableToday }`: "Atiendo urgencias", permanente (`takes_urgencies`; `false` lo apaga, nunca vence) |
| PATCH | `/pro/contact` 🛠 | Canales de contacto (ver "Canales de contacto"); devuelve `/pro/me` con `contact` |
| POST | `/professionals/:id/contact` | Público y con límite: enlace de WhatsApp o `tel:` de un canal habilitado; registra el clic anónimo |
| POST | `/pro/profile/avatar/upload` 🛠 | Firma para subir la foto de perfil directo a Cloudinary (`resuelve/avatars/<professionalProfileId>/<uuid>`, pública, JPG/PNG/WebP) |
| PUT | `/pro/profile/avatar` 🛠 | `{ publicId }`: confirma la foto (formato y peso reales ≤ 5 MB, si no 422 `INVALID_IMAGE`), reemplaza y borra la anterior. Devuelve `/pro/me` |
| DELETE | `/pro/profile/avatar` 🛠 | Elimina la foto (vuelven las iniciales) |
| GET | `/pro/profile/works` 🛠 | Trabajos propios: `{ items: [{ id, title, description, doneOn, archivedByPlan, photos: [{ id, url, caption, sortOrder, archivedByPlan }] }], maxWorks, activeWorks, maxStoredWorks, photosPerWork, activePhotos, maxBytes }` (Free 1 / PRO 10 trabajos, 5 fotos cada uno). Todas las acciones de trabajos y fotos responden esta lista |
| POST | `/pro/profile/works` 🛠 | `{ title, description?, doneOn: 'YYYY-MM' }`: crea un trabajo. Sin lugar en el plan → 409 `WORKS_LIMIT_REACHED`; datos inválidos → 422 `INVALID_WORK` (`details.field`) |
| PATCH | `/pro/profile/works/:id` 🛠 | `{ title?, description?, doneOn? }`. Otro perfil → 403 |
| PATCH | `/pro/profile/works/:id/restore` 🛠 | Vuelve a mostrar un trabajo archivado por plan; sin lugar (Free) reemplaza al último activo |
| DELETE | `/pro/profile/works/:id` 🛠 | Borra el trabajo y sus fotos (Cloudinary + base, foto por foto; si Cloudinary falla, 502 y queda lo que falta) |
| POST | `/pro/profile/work-photos/sign` 🛠 | `{ workId }`: firma para subir directo a Cloudinary (`resuelve/professional-work/<professionalProfileId>/<uuid>`, JPG/PNG/WebP, 8 MB). Trabajo con 5 fotos o archivado → 409 `WORK_PHOTOS_LIMIT_REACHED` |
| POST | `/pro/profile/work-photos` 🛠 | `{ workId, publicId, caption? }`: confirma (formato y peso reales, si no 422 `INVALID_IMAGE`; tope del trabajo bajo lock → 409) y agrega al final del trabajo. Idempotente por publicId |
| PATCH | `/pro/profile/work-photos/:id` 🛠 | `{ caption }` (≤ 80, sin teléfonos ni emails → 422 `INVALID_CAPTION`; vacío = sin descripción). Foto de otro perfil → 403 |
| PATCH | `/pro/profile/work-photos/:id/move` 🛠 | `{ workId }`: pasa la foto a otro trabajo propio, activo y con lugar (queda al final) |
| PUT | `/pro/profile/work-photos/order` 🛠 | `{ workId, ids }`: todas las fotos del trabajo una vez, en el orden nuevo; la primera es la portada (si no, 422 `INVALID_WORK_PHOTO_ORDER`) |
| PATCH | `/pro/profile/work-photos/:id/restore` 🛠 | Reactiva explícitamente una foto archivada si su trabajo tiene lugar; upgrade no restaura nada solo |
| DELETE | `/pro/profile/work-photos/:id` 🛠 | Borra en Cloudinary y en la base; si Cloudinary falla, 502 `WORK_PHOTO_DELETE_FAILED` y la foto sigue (reintentable). Otro perfil → 403 |
| POST | `/pro/verifications/upload` 🛠 | Firma temporal para subir el documento de una matrícula al almacenamiento privado |
| POST | `/pro/verifications` 🛠 | Envía (o reenvía) una verificación con `documentPublicId`; queda `PENDING` |
| GET | `/pro/requests` 🛠 | Solicitudes recibidas, `?status=PENDING\|QUOTED\|SELECTED…` |
| GET | `/pro/requests/:id` 🛠 | |
| POST | `/pro/requests/:id/decline` 🛠 | |
| POST | `/pro/requests/:id/quote` 🛠 | Crea el presupuesto |
| GET/POST | `/pro/requests/:id/questions` 🛠 | Consultas antes de presupuestar (`{ text }`; ver "Herramientas del profesional") |
| GET | `/requests/:id/questions` | Cliente: consultas de su solicitud, por profesional |
| POST | `/requests/:id/questions/:questionId/answer` | Cliente: responde una consulta (`{ text }`) |
| GET/POST | `/pro/quote-templates` 🛠 · DELETE `/pro/quote-templates/:id` 🛠 | Plantillas de presupuesto |
| GET | `/pro/reviews` 🛠 | Reseñas propias con su respuesta (`?page`) |
| PUT/DELETE | `/pro/reviews/:id/reply` 🛠 | Respuesta pública a una reseña (`{ text }`) |
| PATCH | `/pro/quotes/:id` 🛠 | Edita el presupuesto pendiente |
| POST | `/pro/quotes/:id/withdraw` 🛠 | |
| POST | `/pro/requests/:id/appointments` 🛠 | Profesional elegido: propone fecha `{ startsAt, durationMinutes, note?, replacesAppointmentId? }` |
| GET | `/pro/appointments` 🛠 | Agenda: `?from&to` (máx. 62 días), citas `PROPOSED`/`CONFIRMED`/`COMPLETED` que se cruzan con el rango (cada una con `completionDue`) |
| GET | `/pro/analytics/month` 🛠 | "Tu mes": `?year&month` (default: mes en curso, Argentina). `basic` siempre (con `acceptedQuotesValue`); `advanced` con `canUseAdvancedAnalytics`; `exposure` con `canSeeExposureAnalytics` o, sin él, `proPreview` (totales + lo que pasó sin PRO); `proMonthlyPrice` |
| GET | `/pro/appointments/completion-due` 🛠 | Pendientes de cierre de cualquier semana (confirmadas, horario terminado, sin marcar realizadas) |

### Errores

Todas las respuestas de error tienen el mismo formato:

```json
{ "statusCode": 409, "code": "INVALID_REQUEST_STATE", "message": "No se puede pasar una solicitud de WAITING_QUOTES a AWAITING_REVIEW", "details": { "from": "WAITING_QUOTES", "to": "AWAITING_REVIEW" }, "path": "/api/v1/…", "timestamp": "…" }
```

El frontend debe decidir por `code` (lista en `src/common/errors/error-codes.ts`), no por `message`. Los errores 5xx nunca exponen stack traces ni SQL.

## Reglas de negocio implementadas en el servidor

- **Privacidad de la dirección** (`requests/request.presenter.ts`): un profesional invitado ve barrio, descripción y fotos, y del cliente solo nombre + inicial. Dirección exacta, nombre completo y teléfono se comparten **solo** con el profesional elegido y **solo** mientras el trabajo está activo (`PROFESSIONAL_SELECTED`, `SCHEDULED`). Terminado (`COMPLETED`) o cancelado, deja de compartirse. La agenda nunca trae contacto ni dirección.
- **Invitaciones**: máximo 6 destinatarios por solicitud (validado en DTO y servicio con lock de fila); nadie se invita a sí mismo; elegibilidad con la regla única `requestIneligibility` (ver "Núcleo profesional"): perfil activo, ofrece el servicio y cubre el barrio (o "Todo Tandil"); la matrícula no cuenta. Si falla: `422 PROFESSIONAL_NOT_ELIGIBLE` con `details.reason` (`PROFILE_PAUSED`, `SERVICE_NOT_OFFERED`, `ZONE_NOT_COVERED`). En urgencias, además, toma urgencias ahora.
- **Presupuestos**: la elegibilidad se vuelve a validar al crear el presupuesto (perfil activo y servicio) para que una invitación vieja no alcance después de pausar el perfil o quitar el servicio. La **cobertura no** se vuelve a exigir: se validó al invitar, y cambiar de barrios no invalida lo que el profesional ya recibió ni trabajo ya coordinado. Solo quien fue invitado; uno activo por profesional y solicitud (regla + índice único parcial); se edita el existente; `totalAmount` lo calcula el servidor (si los envía el cliente → 400). Con ítems, materiales = suma de ítems.
- **Invitación dirigida**: `request_invitations.targeted` deriva del booleano explícito `targeted` del `POST /requests/:id/invitations`, que el frontend conserva como `RequestStore.flowMode`. Es `true` solo para el CTA individual de un profesional y solo en la primera invitación con un único id. Seleccionar uno en el flujo de resultados/comparación sigue siendo `DISCOVERY`; la cantidad de ids nunca asigna `targeted` por sí sola. Los clientes antiguos que envíen solo `professionalIds` quedan en `false`.
- **Early access y cupos de Fase 2** (`requests/opportunity-access.ts`, única fuente de disponibilidad/actionability): PRO efectivo y FIRST_SUCCESS_TRIAL reciben discovery de inmediato; Free post-éxito recibe discovery al cumplir `available_at` (30 min por defecto) **solo si un PRO elegible del mismo pedido tuvo acceso antes** (`proAccessAt`: una invitación de la misma tanda o un `EARLY_OPPORTUNITY_DELIVERED` anterior de ese pedido; la ventana corre desde el acceso del PRO, así que quien se suma después espera solo lo que falta). Sin PRO delante, un pedido de hoy/urgente (`DELAY_EXEMPT_URGENCIES`) o `targeted=true`, queda disponible al entregarse, también en Free. Ver "Demora de Free y evidencia antes/después". Antes de `available_at`, el backend redacta datos sensibles y rechaza el POST de presupuesto; Angular no decide acceso. El límite de destinatarios es 6 para que cinco respuestas inmediatas puedan llenar los cinco cupos mientras el sexto Free espera. Ocupan cupo `PENDING` vigente y `ACCEPTED`; `EXPIRED`, `REJECTED` y `WITHDRAWN` lo liberan. Editar el mismo presupuesto no agrega un cupo. La creación bloquea la fila de solicitud para que envíos concurrentes no superen `MAX_ACTIVE_QUOTES_PER_REQUEST`. El detalle del cliente incluye `quoteCapacity` con cantidad activa, máximo y lugares restantes.
- **Contador “para responder”**: `ProRequestsService.actionableCount` usa `isActionableOpportunity`, la misma regla que las tarjetas y el endpoint de cotización: excluye canceladas/cerradas, invitaciones respondidas, quotes propias, cupo Free agotado, demora pendiente y cupos llenos.
- **Atribución de origen** (`request_invitations.attribution_source`): guarda `ORGANIC_SEARCH`, `PRO_FEATURED`, `DIRECT_PUBLIC_PROFILE`, `DIRECT_TARGETED`, `MARKETPLACE_DISCOVERY`, `MULTI_SELECT` u `OTHER`. `PRO_FEATURED` requiere una misma sesión opaca con impresión destacada, visita al perfil posterior y solicitud dirigida dentro de la ventana; el plan PRO por sí solo no cambia el origen. La búsqueda conserva primero la elegibilidad/matching; PRO y “Disponible hoy” solo priorizan candidatos elegibles.
- **Aceptar presupuesto** (transacción + `SELECT … FOR UPDATE`): valida dueño, estado y vigencia; la quote pasa a `ACCEPTED`, las demás a `REJECTED`; invitaciones `SELECTED`/`NOT_SELECTED`; la solicitud registra al profesional elegido. Dos aceptaciones simultáneas: solo una gana (hay un test que lo prueba).
- **Reseñas** (`reviews/`): regla única `reviewBlocker` (la usan el POST y `canReview` del detalle del cliente): solo el cliente dueño, solo con el trabajo realizado (`COMPLETED`, o `AWAITING_REVIEW` legacy) y un profesional contratado, nunca el propio perfil profesional, una por trabajo (regla + lock de la solicitud + índice único `reviews.request_id`). El profesional sale **siempre** de `selectedProfessionalId`: el body es `{ rating, comment? }` y cualquier otro campo → 400. `rating` entero 1–5; `comment` opcional, recortado, ≤ 1000 caracteres, texto plano (algo con forma de etiqueta HTML → 400; vacío → `null`). Recalcula el rating en la misma transacción; no cambia el estado.
- **Reseña pública** (`review.presenter.ts`): `{ id, rating, comment, reviewerDisplayName, createdAt }`. `reviewerDisplayName` es solo el nombre de pila; no salen apellido, ids, barrio, servicio, monto ni dirección. `GET /professionals/:id` trae la primera página (10, más recientes primero) y `GET /professionals/:id/reviews?page&pageSize` el resto (404 si el perfil no existe o está pausado).
- **Reportes y moderación** (`review-reports.service.ts`, `review-moderation.service.ts`, tablas `review_reports` y `reviews.hidden_at`): el reporte no oculta nada; lo resuelve una persona desde el panel admin (`GET /admin/reports?status=open|resolved`, `POST /admin/reports/:id/hide` {reason 5–300} · `/dismiss`, `POST /admin/reports/reviews/:reviewId/restore`; solo `is_admin`, 404 al resto, 409 `REPORT_ALREADY_RESOLVED` si otra sesión ya lo resolvió) o con `npm run reviews:moderation -- list | show <reporte> | hide <reporte> --reason "…" | dismiss <reporte> | restore <reseña>` (contra una base remota pide escribir HIDE / DISMISS / RESTORE). `hide` marca la reseña (`hidden_at`) y resuelve como HIDDEN todos sus reportes abiertos; `restore` la devuelve. Una reseña oculta queda fuera de lo público, de `recalculateProfessionalMetrics` y de Tu mes, pero sigue ocupando el lugar de esa persona (no puede reseñar de nuevo).
- **Solicitud del cliente**: `review` (su reseña o `null`) y `canReview` (misma regla que el POST).
- **Reseñas por invitación** (`invited-review.ts`, única regla; `invited-reviews.service.ts`): `reviews` con `request_id` NULL y `verified_work = false` (`ck_reviews_kind`: verificada ⇔ con solicitud). Con cuenta (`invited-review`) o sin cuenta (`guest-review`: `reviewer_name` + `reviewer_email` en minúsculas, **privado**, nunca en una API pública; índice único `uq_reviews_guest_email_professional` por profesional + correo; `client_id` NULL; el correo no se verifica). Un correo que pertenece a una cuenta se evalúa como esa cuenta (no esquiva su perfil, sus reseñas ni su trabajo pendiente). Bloqueos (`details.blocker`, 409): `OWN_PROFILE`, `ALREADY_REVIEWED` (cualquier reseña previa del cliente a ese profesional; índice único parcial `uq_reviews_invited_client_professional`), `USE_JOB_REVIEW` (tiene un trabajo `COMPLETED` con ese profesional sin reseña: va por esa, y `requestId` lo indica) y `LIMIT_REACHED` (`INVITED_REVIEWS_LIMIT` = 20 en 30 días por profesional). Perfil pausado o inexistente → 404. Todo en una transacción con el perfil bloqueado. **No tocan** `average_rating`, `reviews_count` ni el orden (`recalculateProfessionalMetrics` filtra `verified_work`); tampoco "Tu mes". `GET /professionals/:id` trae aparte `invitedReviewsCount`, `invitedAverageRating` e `invitedReviews` (primera página); `presentPublicReview` suma `invited`. Avisa al profesional con `PRO_REVIEW_RECEIVED` (sin solicitud; `dedupeRef` = id de la reseña). El profesional no puede borrarlas.
- **`minRating`**: filtra por el rating real; sin reseñas no cumple ningún mínimo (`reviews_count > 0`). El orden de la búsqueda no cambió.
- **Citas y trabajo realizado**: ver "Coordinación del trabajo y agenda".
- **Notificaciones**: ver "Notificaciones in-app".
- **Métricas**: `averageRating`, `reviewsCount` y `completedJobsCount` se calculan desde las tablas (`professional-metrics.ts`); ningún endpoint las acepta.
- **Verificaciones**: el profesional las envía (quedan `PENDING`); solo un admin las aprueba o rechaza, desde el panel `/admin/matriculas` o con `npm run verification:review`. Ver "Núcleo profesional".
- **Plan FREE/PRO**: ver "Planes, entitlements y destacados". Tras el primer éxito, FREE responde hasta `FREE_QUOTE_LIMIT` (default del código: 3; el valor efectivo depende de la configuración de cada entorno) oportunidades discovery distintas en total; la siguiente responde 403 `FREE_QUOTE_LIMIT_REACHED`. Antes del primer éxito, el trial habilita respuestas ilimitadas sin convertir el perfil en PRO público. Recibir solicitudes nunca tiene tope.

## Coordinación del trabajo y agenda

Después de aceptar un presupuesto, el **profesional elegido propone** fecha, hora y duración estimada (30 min a 8 h; nota opcional). El cliente **confirma** o **pide otro horario**. No hay negociación tipo chat: ya tienen teléfono y dirección para hablar por fuera; Resuelve registra la coordinación formal.

```text
PROFESSIONAL_SELECTED ─ propone ─→ cita PROPOSED ─ confirma ─→ cita CONFIRMED + solicitud SCHEDULED
                                      │ "No puedo" → DECLINED (sigue PROFESSIONAL_SELECTED, puede proponer otra)
SCHEDULED ─ cancelar horario / reprogramar ─→ cita CANCELLED + solicitud PROFESSIONAL_SELECTED (mismo profesional)
SCHEDULED + terminó el horario ─ cliente o elegido: "se realizó" ─→ cita COMPLETED + solicitud COMPLETED (misma transacción)
SCHEDULED + terminó el horario ─ "necesitamos reprogramar" ─→ cita CANCELLED + solicitud PROFESSIONAL_SELECTED (mismo profesional)
Cancelar la solicitud cancela la cita activa en la misma transacción.
```

- **Modelo** (`appointments`, se reutilizó la tabla existente): `scheduled_start`/`scheduled_end` (UTC, `timestamptz`), `status` (`PROPOSED`, `CONFIRMED`, `DECLINED`, `CANCELLED`, `COMPLETED`), `note`, `cancelled_by` (`CLIENT`/`PROFESSIONAL`). Hay **historial**: una solicitud puede tener varias citas, pero como máximo una `PROPOSED`/`CONFIRMED` (índice único parcial `uq_appointments_active_per_request`).
- **Reemplazar** ("Cambiar propuesta" / "Reprogramar") = cancelar la activa + crear una propuesta, en una transacción. El pedido manda `replacesAppointmentId`; si no coincide con la cita activa actual (UI vieja, otra pestaña), `409 APPOINTMENT_STATE_CHANGED`. Una cita confirmada nunca se edita en silencio: el cliente vuelve a confirmar.
- **Quién**: solo el profesional elegido propone y reprograma; los demás invitados y cualquier otro reciben `404`. Solo el cliente dueño confirma o rechaza. Cancelar el horario: el cliente (confirmada) o el elegido (propuesta o confirmada). **Completar** (`POST /requests/:id/complete`): el cliente dueño **o** el profesional elegido; el backend identifica al actor y guarda `completed_by`. Así un olvido de una sola parte no deja el trabajo abierto para siempre.
- **Conflictos**: dos citas `CONFIRMED` del mismo profesional no se superponen (`409 APPOINTMENT_OVERLAP`, sin datos del otro cliente). Se valida al proponer y al confirmar; las propuestas, canceladas y rechazadas no bloquean.
- **Concurrencia**: toda operación bloquea la solicitud (`FOR UPDATE`) y decide por el estado releído; las que ocupan horario bloquean además el perfil del profesional (orden: solicitud → perfil). Doble click en confirmar, rechazar, cancelar o completar: idempotente (200 sin cambios). Cliente y profesional completando a la vez: una sola transición, el segundo recibe el estado actual. "Necesitamos reprogramar" contra "completar" a la vez: gana el primero y el otro recibe `409`; nunca queda una solicitud `COMPLETED` con la cita `CANCELLED` (tests e2e).
- **Vencimiento**: no se puede confirmar una propuesta cuyo horario ya pasó (`409 APPOINTMENT_EXPIRED`). Completar exige que haya terminado el horario confirmado (`scheduled_end <= now()`; antes, `409 APPOINTMENT_NOT_ENDED`).
- **Pendiente de cierre** (`appointments/completion.ts`, `isCompletionDue`): cita `CONFIRMED` + `now >= endsAt` + solicitud `SCHEDULED`. Se **deriva al consultar** (`completionDue` y `canComplete` —la misma regla que valida `POST /requests/:id/complete`— en la solicitud del cliente, la del profesional elegido y cada ítem de agenda; contadores en `/me/notifications/summary`), sin cron ni notificación persistida. No cambia ningún estado. Los horarios son `timestamptz` (instantes UTC); el borde es exacto: cita 17:48–18:18 (Argentina) → 18:17 no, 18:18 sí (tests unitarios y e2e). El frontend no recalcula con su reloj: relee al llegar `endsAt`.
- **Agenda** (`GET /pro/appointments?from&to`): citas del profesional autenticado que se cruzan con el rango, sin canceladas ni rechazadas. Solo servicio, barrio, título y cliente abreviado; contacto y dirección quedan en el detalle autorizado.
- **Hora**: se guarda UTC y se muestra en `America/Argentina/Buenos_Aires` (`common/time.ts` en el backend, `core/utils/business-time.ts` en el frontend).

## Notificaciones in-app

Avisos **contextuales** para que algo importante no pase desapercibido. Sin WhatsApp, SMS ni WebSocket: la app consulta (`GET /me/notifications/summary`). Una parte sale además por email y como push (ver "Avisos por email" y "Avisos push").

| Tipo | Lo recibe | Cuándo |
|---|---|---|
| `CLIENT_QUOTE_RECEIVED` | Cliente dueño | Un profesional envía un presupuesto |
| `CLIENT_APPOINTMENT_PROPOSED` | Cliente dueño | El elegido propone (o cambia) un horario |
| `CLIENT_APPOINTMENT_RESCHEDULED` | Cliente dueño | El elegido reprograma una cita confirmada |
| `PROFESSIONAL_SELECTED` | Profesional elegido | El cliente acepta su presupuesto |
| `PRO_APPOINTMENT_CONFIRMED` | Profesional elegido | El cliente confirma el horario |
| `PRO_APPOINTMENT_DECLINED` | Profesional elegido | El cliente no puede en ese horario, cancela la cita o pide reprogramar |
| `PRO_REQUEST_RECEIVED` | Profesional invitado | Un cliente le pide presupuesto (una por invitación: `dedupe_key = PRO_REQUEST_RECEIVED:<requestId>:<professionalId>`) |
| `PRO_JOB_COMPLETED` | Profesional elegido | El **cliente** marca el trabajo como realizado (`POST /requests/:id/complete`, con cita o sin ella): "Pedile una reseña". Una por solicitud (`notifyProWorkCompleted`); si lo cierra el profesional no se avisa a sí mismo. Queda leída al abrir el trabajo o cuando el cliente reseña |

**Dónde está la novedad** (`NOTIFICATION_DESTINATION` en `notification.entity.ts`, única fuente): cada tipo del modo profesional tiene una sección y, en Solicitudes, una pestaña. El resumen devuelve los contadores ya agrupados; el frontend no decide nada.

| Tipo | Sección | Pestaña |
|---|---|---|
| `PRO_REQUEST_RECEIVED` | Solicitudes | Nuevas (`PENDING`) |
| `PROFESSIONAL_SELECTED` | Solicitudes | Aceptadas (`SELECTED`) |
| `PRO_APPOINTMENT_DECLINED` | Solicitudes | Aceptadas (se propone otra fecha desde la solicitud) |
| `PRO_APPOINTMENT_CONFIRMED` | Agenda | — |
| `PRO_JOB_COMPLETED` | Agenda | — |
| Pendiente de cierre (derivado, no es notificación) | Agenda | — |

### Avisos por email

Las notificaciones in-app siguen siendo la fuente: un job (`EmailNotificationScheduler`, cada `EMAIL_NOTIFICATIONS_INTERVAL_SECONDS`, 60 por defecto) lee las pendientes y las manda por el `EmailModule` que ya existe (SMTP, `SMTP_HOST`). **Apagado por defecto**: se prende con `EMAIL_NOTIFICATIONS_ENABLED=true` y necesita SMTP (Render Free bloquea los puertos SMTP; hace falta un plan pago). Con el flag y sin `SMTP_HOST` queda apagado y lo avisa en el log. Nunca corre en tests (`NODE_ENV=test`); los tests llaman a `EmailNotificationDispatcher.dispatch()`.

- **Qué sale** (`notifications/email/email-notification-copy.ts`, única fuente): nueva solicitud / pedido directo / elegido / horario confirmado / necesita otro horario / cierre pendiente (profesional) y presupuesto / horario propuesto o reprogramado / trabajo agendado o reprogramado / cancelado / cierre pendiente (cliente). Lo demás (presupuesto editado, trabajo iniciado, reseñas, referidos) queda solo en la app.
- **Qué lleva**: una frase general y un enlace a Resuelve. **Nunca** nombre, dirección, teléfono ni texto del pedido.
- **Cuándo no sale**: ya se leyó en la app, tiene más de 24 h, `availableAt` todavía no llegó (oportunidad Free demorada), la persona se dio de baja o superó `EMAIL_NOTIFICATIONS_MAX_PER_USER_DAY` (12) en 24 h. Todo `SKIPPED`: sigue en la app.
- **Un mensaje por persona y ciclo**: varias novedades juntas = un resumen ("Tenés 3 novedades").
- **Tope global** `EMAIL_NOTIFICATIONS_DAILY_LIMIT` (400 en 24 h; Gmail personal ronda los 500 destinatarios por día). Lo que excede queda pendiente para el ciclo siguiente.
- **Estado** en `notifications.email_status` (NULL pendiente · `SENDING` · `SENT` · `SKIPPED` · `FAILED`) + `emailed_at` + `email_attempts`. El reclamo es atómico (`FOR UPDATE SKIP LOCKED`): dos instancias no mandan lo mismo. Si el SMTP falla se reintenta en el ciclo siguiente, hasta 3 intentos. La migración `EmailNotifications` marca las notificaciones existentes como `SKIPPED`: prender el envío nunca manda avisos viejos.
- **Baja**: `users.email_notifications` (default true). `PATCH /me/notifications/email-preference { enabled }` (Mi perfil) o `POST /notifications/email-unsubscribe { token }` (público, throttle 10/min) con el token firmado del mensaje (`<userId>.<HMAC>`, derivado de `JWT_ACCESS_SECRET`, sin vencimiento, solo apaga los avisos de esa cuenta; inválido = 400 `INVALID_UNSUBSCRIBE_TOKEN`). El mensaje lleva el enlace de baja y la cabecera `List-Unsubscribe`.
- **Resend (recomendado)**: `RESEND_API_KEY` + `EMAIL_FROM="Resuelve <no-responder@tu-dominio>"` con el dominio verificado en Resend (registros DNS SPF/DKIM). Va por HTTPS (`ResendEmailSender`), así que funciona también en Render Free. Tiene prioridad sobre `SMTP_HOST`; sin ninguno de los dos no se envía nada.
- **Gmail**: `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_SECURE=true`, `SMTP_USER` = la cuenta, `SMTP_PASS` = App Password de 16 caracteres (requiere verificación en dos pasos; nunca la contraseña normal) y `EMAIL_FROM="Resuelve <la-misma-cuenta@gmail.com>"` (Gmail reescribe el remitente a la cuenta autenticada). Para más volumen o mejor entregabilidad, cambiar a un proveedor transaccional es reemplazar el `useFactory` de `EmailModule`.
- Los emails no se verifican mientras `EMAIL_VERIFICATION_ENABLED=false`: un aviso puede llegar a un email mal escrito o ajeno; por eso la baja funciona sin sesión.

### Avisos push

Web Push estándar con la librería `web-push` y claves VAPID, **sin Firebase ni proveedor pago** (`src/notifications/push/`). Las notificaciones in-app siguen siendo la fuente; el service worker de Angular (`ngsw`) muestra el aviso y al tocarlo abre su pantalla (`notificationRoute`, la misma del centro).

- **Apagado por defecto.** Se prende con `PUSH_NOTIFICATIONS_ENABLED=true` + `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` y `VAPID_SUBJECT` (`mailto:` o URL). Las claves se generan **una vez** con `npm run push:keys` (cambiarlas invalida todas las suscripciones). Con el flag y sin claves queda apagado y lo avisa en el log. Nunca corre en tests; los tests llaman a `PushNotificationDispatcher.dispatch()` con `FakePushSender`.
- **Dispositivos** (`push_subscriptions`: `endpoint` único, `p256dh`, `auth`, `failures`, `last_success_at`; sin user agent ni datos del equipo): `GET /me/push/config` → `{ enabled, publicKey }`; `POST /me/push/subscriptions { endpoint, keys }` (204; 409 `PUSH_DISABLED`; 422 si el endpoint no es de un servicio de push real); `POST /me/push/subscriptions/status { endpoint }` → `{ subscribed }`; `POST /me/push/subscriptions/remove { endpoint }` (solo la propia, idempotente). El endpoint viaja en el body, nunca en la URL. **Lista de servicios admitidos** (`push-endpoint.ts`: FCM, Mozilla, Apple, WNS, solo https): el backend le hace un POST, así que nunca a una URL cualquiera. Mismo endpoint con otra cuenta = pasa a esa cuenta. Máximo 10 por persona (se descartan los más viejos).
- **Qué sale** (`push-copy.ts`, única fuente): todo lo que pide algo menos reseñas recibidas y referidos (pueden esperar a abrir la app). `PRO_JOB_COMPLETED` sí sale: pedir la reseña sirve en el momento. Título + frase general, **sin PII** (pasa por Google, Apple o Mozilla). Varias novedades de una persona en un ciclo = un aviso ("Tenés N novedades para ver").
- **Cuándo**: apenas termina una request que escribe (`PushKickInterceptor` global → `PushNotificationScheduler.kick()`, con 1,5 s para juntar las novedades de un clic) y cada 60 s de respaldo mientras el servidor esté despierto. En Render Free un job solo no alcanza (el servidor duerme), pero cada notificación nace de una request y ahí está despierto.
- **"Antes que Free"**: si en la misma solicitud un Free la recibe más tarde (`available_at` demorado detrás de un PRO), la "Nueva solicitud" de cada PRO invitado (plan efectivo, no la prueba del primer éxito) guarda `payload.aheadOfFree` y sale con `PUSH_AHEAD_OF_FREE_COPY` ("Te llegó antes que a los perfiles Free…"; en una urgencia, `PUSH_URGENT_AHEAD_OF_FREE_COPY`). Sin Free demorado, el texto de siempre. El centro devuelve `aheadOfFree` para el mismo texto in-app. `EARLY_OPPORTUNITY_DELIVERED` guarda `aheadOfFree` en el contexto y `EARLY_AHEAD_OF_FREE_SQL` (`requests/delay-evidence.ts`) es lo que cuentan Tu mes, la prueba y el resumen semanal: ya no cuenta como "antes" un evento sin la marca; hace falta un Free con la demora registrada en esa misma solicitud.
- **Horario de silencio**: `PUSH_QUIET_START_HOUR`–`PUSH_QUIET_END_HOUR` (23–8, Argentina): solo se reclaman las solicitudes `URGENT` (`URGENT_PUSH_TYPES`) de quien atiende urgencias (`URGENT_ONLY_SQL`), con el copy "Urgencia nueva" (`PUSH_URGENT_COPY`, que también se usa de día); lo demás sale todo junto al terminar (si hay tráfico que despierte el servidor; lo de más de 12 h ya no se manda).
- **Cuándo no sale**: ya se leyó, no está en `PUSH_COPY`, tiene más de 12 h, `availableAt` todavía no llegó o la persona no tiene dispositivos. `SKIPPED`: sigue en la app.
- **Estado** en `notifications.push_status` (NULL pendiente · `SENDING` · `SENT` · `SKIPPED` · `FAILED`) + `pushed_at` + `push_attempts`, reclamo atómico (`FOR UPDATE SKIP LOCKED`), hasta 3 intentos. 404/410 del servicio = el dispositivo ya no existe: se borra; 5 errores seguidos, también. La migración `PushNotifications` marca las notificaciones existentes como `SKIPPED`.
- **Baja**: Mi perfil ("Avisos en este dispositivo"), cerrar sesión (el front la da de baja antes de borrar la sesión), baja de cuenta (borra todas) y borrado definitivo (CASCADE).
- Tests: `test/push-notifications.e2e-spec.ts`, `src/notifications/push/push.spec.ts`.

- "Nueva solicitud" deja de pedir algo (queda leída) al presupuestar o responder "No disponible", cuando el cliente elige a alguien o cuando cancela la solicitud.
- La migración `ActionableNotificationsAvatar` recrea el tipo `notification_type` (para usar el valor nuevo en la misma transacción y poder revertir) y crea una "Nueva solicitud" sin leer por cada invitación que sigue sin responder en una solicitud abierta: el badge no cambia al desplegar.

- **Tabla** `notifications`: `user_id`, `type`, `request_id`, `quote_id`/`appointment_id` opcionales, `created_at`, `read_at`, `dedupe_key` (único). Sin dirección, teléfono ni textos del pedido; la lista agrega solo el título de la solicitud y, en un presupuesto, el nombre público de quien lo mandó.
- **Se crea** con `notify()` (`notifications/notify.ts`) **dentro de la transacción** de la acción: si la acción falla no queda aviso. **Idempotente**: `dedupe_key = "<TYPE>:<quoteId|appointmentId|requestId>"` + `INSERT … ON CONFLICT DO NOTHING` (un reintento o doble submit no duplica). **Nunca a quien actúa**.
- **Reemplazos**: un horario nuevo deja leído el aviso del anterior; retirar un presupuesto deja leído su aviso; aceptar un presupuesto deja leídos los avisos de presupuestos de esa solicitud; si el profesional retira su propuesta, el aviso al cliente queda leído.
- **Modos separados** (`audience`): `CLIENT_*` se ven como cliente y `PROFESSIONAL_SELECTED`/`PRO_*` en modo profesional. Una misma cuenta nunca mezcla los contadores.
- **Leído**: `PATCH /me/notifications/read-by-request/:requestId?audience=` marca solo las de esa solicitud, ese usuario y ese modo (`read_at`, no se borra); con `&section=AGENDA` (abrir el trabajo en la Agenda) solo las de esa sección. Entrar a `/pro/solicitudes` no marca nada. Ownership estricto: si la solicitud no es tuya (o no te invitaron, en modo profesional) → `404`.

## Foto de perfil profesional

- **Almacenamiento** (`professionals/avatar/avatar-storage.ts`): las mismas credenciales de Cloudinary que las matrículas, pero **separado** del almacenamiento privado: carpeta `resuelve/avatars/<professionalProfileId>` (sin email ni teléfono), `type=upload` (pública, se muestra en perfiles y listados), solo JPG/PNG/WebP, `overwrite=false` y una transformación de entrada `c_limit,w_1600,h_1600` que re-codifica la imagen: el original guardado ya no tiene EXIF (GPS, cámara).
- **Flujo**: firma (`POST /pro/profile/avatar/upload`) → el navegador sube directo a Cloudinary → `PUT /pro/profile/avatar { publicId }`. El backend exige que el publicId sea de SU carpeta, consulta al proveedor formato y peso reales (≤ 5 MB) y, si no cumplen, lo borra y responde 422 `INVALID_IMAGE`. Sin credenciales: 503 `UPLOADS_NOT_CONFIGURED`.
- **Se guarda** en `professional_profiles`: `avatar_public_id` (para reemplazar o borrar) y `avatar_url` (entrega `c_fill,g_auto,w_256,h_256,q_auto,f_auto`, versionada). Nunca el binario. Reemplazar o eliminar borra la anterior del proveedor.
- **Contrato público**: `avatarUrl` en perfil, búsqueda, destacados, presupuestos, invitaciones y `/auth/me` (la foto profesional; si no hay, la de la cuenta, hoy siempre `null` → iniciales). Una foto **no** es una verificación de identidad.

## Portada PRO

- **Beneficio PRO** (`canUseCoverPhoto` en `entitlementsFor`): `POST /pro/profile/cover/upload` (firma) y `PUT /pro/profile/cover { publicId }` exigen PRO vigente (403 `PRO_REQUIRED`); `DELETE /pro/profile/cover` no (es su contenido). `professionals/avatar/cover.service.ts`.
- **Almacenamiento**: el mismo público del avatar, carpeta `resuelve/covers/<professionalProfileId>`, JPG/PNG/WebP ≤ 8 MB (`MAX_COVER_BYTES`, validado con el proveedor), entrada `c_limit,w_1600,h_1600` (sin EXIF) y entrega `COVER_DELIVERY` (`c_fill,g_auto,w_1500,h_500,q_auto,f_auto`, 3:1). Reemplazar o quitar borra la anterior del proveedor.
- **Columnas** `cover_public_id` / `cover_url` (migración `1794900000000-ProCoverPhoto`, apply → revert → apply probado).
- **Contrato**: público `coverUrl` solo con PRO vigente (al bajar a Free queda guardada y oculta, nada se borra solo); `/pro/me` además `savedCoverUrl`. La baja de cuenta la borra de Cloudinary y de la fila.
- Tests: `test/avatar-location.e2e-spec.ts` ("portada PRO").

## Trabajos realizados (portfolio del profesional)

- **Por trabajo**: cada trabajo (`professional_works`: nombre "Casa 1", descripción opcional y mes y año) agrupa sus fotos (`professional_work_photos.work_id`). Se ordenan por fecha, del más reciente al más viejo; dentro de cada trabajo, por `sort_order` manual (la primera es la portada).
- **Entitlement** (`plans/plan.ts` → `portfolioWorkLimit`, única fuente): Free muestra **1 trabajo** y PRO hasta **10**, con hasta **5 fotos cada uno** en los dos planes (`work-photo-rules.ts`: `FREE_WORK_LIMIT`, `PRO_WORK_LIMIT`, `PHOTOS_PER_WORK`). Se guardan hasta 10 trabajos. La API devuelve el límite efectivo y los contadores; el backend lo calcula, bloquea y vuelve a validar bajo lock de perfil.
- **Downgrade reversible**: al pasar a Free queda activo el trabajo más reciente (y sus primeras 5 fotos); el resto se marca `archivedByPlan` (trabajos y, si hiciera falta, fotos): no se publica ni se borra. Volver a PRO no reactiva nada solo: el dueño elige "Mostrar este trabajo" (en Free reemplaza al que se muestra) o reactiva una foto si el trabajo tiene lugar. Un trabajo archivado no recibe fotos.
- **Reglas** (`professionals/work-photos/work-photo-rules.ts`): JPG/PNG/WebP de hasta **8 MB**; nombre del trabajo de 2 a 60 caracteres, descripción del trabajo ≤ 160 y de la foto ≤ 80 (una línea, sin teléfonos ni emails: son públicos → 422 `INVALID_WORK` con `details.field` o `INVALID_CAPTION`); mes y año desde 1980 y nunca futuro (mes de Argentina). El portfolio no cambia búsquedas ni elegibilidad.
- **Tablas** `professional_works` (migración `1794600000000-ProfessionalWorks`: `id`, `professional_id` cascade, `title`, `description`, `done_on` = día 1 del mes, `archived_by_plan`) y `professional_work_photos` (`1791700000000`, `1792200000000` y `work_id` cascade de la `1794600000000`). La migración no pierde ni reparte fotos: cada perfil con fotos sueltas recibe un trabajo con todas, en el mismo orden ("Mis trabajos", o "Trabajos anteriores" si tenía más de 5), fechado en el mes de la primera; ese trabajo puede seguir con más de 5 (en PRO se ven todas, no se le suman más; en Free se archivan las que pasan de 5) hasta que el profesional las reparta. `featured` (foto principal suelta) quedó legacy: la portada es la primera foto. Nada de ubicación, cliente ni EXIF. La tabla legacy `portfolio_items` no se lee ni se expone.
- **Cloudinary**: mismo almacenamiento público que el avatar (`avatar-storage.ts`), otra carpeta: `resuelve/professional-work/<professionalProfileId>/` (la agrupación vive en la base: pasar una foto de trabajo no toca Cloudinary). Subida firmada (el API Secret nunca sale del servidor), transformación de entrada `c_limit,w_1600,h_1600` (re-codifica: sin EXIF ni GPS y el original guardado ya queda acotado a 1600 px) y entrega `c_limit,w_1600,h_1600,q_auto,f_auto`.
- **Cupo en el backend**: crear un trabajo, firmar, confirmar, pasar o reactivar toman `pessimistic_write` sobre el perfil, cuentan y recién ahí escriben. Confirmaciones concurrentes nunca pasan de 5 fotos por trabajo: la subida sobrante se borra de Cloudinary.
- **Borrar**: una foto, dentro de la transacción, primero Cloudinary y después la fila (y se compacta `sort_order`); un trabajo, foto por foto igual y al final la fila del trabajo. Si Cloudinary falla, 502 `WORK_PHOTO_DELETE_FAILED` y queda lo que falta (reintentable): nunca una fila que apunta a un archivo borrado. Eliminar la cuenta borra trabajos y fotos.
- **Solo el dueño** opera (el perfil sale del token; un trabajo o una foto de otro perfil → 403, inexistente → 404; pasar a un trabajo ajeno → 403).
- **Perfil público** (`GET /professionals/:id`): `works: [{ id, title, description, doneOn: 'YYYY-MM', photos: [{ id, url, caption, sortOrder }] }]`, solo trabajos activos con al menos una foto activa, sin `publicId` ni estado interno. Vacío → el frontend no muestra la sección.
- Tests: `test/work-photos.e2e-spec.ts` cubre alta y validación de trabajos, topes Free 1 / PRO 10 y 5 fotos (también concurrentes), downgrade y archivo reversible con elección del trabajo visible, trabajo migrado con más de 5, editar, ordenar, pasar fotos, borrar fotos y trabajos (con falla de Cloudinary), formato/peso, descripciones, ownership y perfil público; además `work-photo-rules.spec.ts`.

## Herramientas del profesional

Migración `1794700000000-ProTools` (apply → revert → apply probado). Tests: `test/pro-tools.e2e-spec.ts` y `src/requests/questions/request-question-rules.spec.ts`.

- **Plantillas de presupuesto** (`quotes/templates/`, tabla `quote_templates`): nombre, qué se hace, aclaraciones, duración y montos (pesos enteros, mismos límites que `CreateQuoteDto`). Privadas del dueño (la de otro perfil → 404), hasta `MAX_QUOTE_TEMPLATES` (20, con lock del perfil → 409 `QUOTE_TEMPLATES_LIMIT_REACHED`). Free y PRO. Usarla solo completa el formulario: no crea ni envía nada. `GET/POST /pro/quote-templates`, `DELETE /pro/quote-templates/:id` (toda respuesta es la lista).
- **Respuesta pública a reseñas** (`reviews/review-reply.ts`, única regla; `reviews.professional_reply` + `professional_replied_at`): una por reseña (por Resuelve o invitada), 2–500 caracteres, sin teléfonos ni emails (`common/text/contact-in-text.ts`, la misma regla que las fotos), solo reseñas propias y visibles (otra u oculta → 404). No cambia rating ni orden. Viaja como `reply: { text, repliedAt } | null` en toda reseña pública (perfil, paginado, Tu mes). `GET /pro/reviews?page`, `PUT/DELETE /pro/reviews/:id/reply`.
- **Consultas antes de presupuestar** (`requests/questions/`, tabla `request_questions`; regla única en `request-question-rules.ts`): pregunta un profesional invitado con la invitación `PENDING` o `QUOTED`, la solicitud recibiendo presupuestos y la oportunidad ni bloqueada (cupo Free) ni demorada (acceso anticipado) → si no, 409 `QUESTION_NOT_ALLOWED`; una a la vez (409 `QUESTION_PENDING`) y hasta 3 por solicitud (409 `QUESTIONS_LIMIT_REACHED`); el cliente responde cada una una vez (409 `QUESTION_ALREADY_ANSWERED`) mientras recibe presupuestos. Textos 2–500 sin teléfonos ni emails (422 `INVALID_QUESTION`). No consume cupo ni cambia la invitación. Avisos en la transacción: `CLIENT_QUESTION_RECEIVED` (al cliente; responder la marca leída) y `PRO_QUESTION_ANSWERED` (al profesional), ambos con ruta `#consultas`, email y push sin el texto. `GET/POST /pro/requests/:id/questions`, `GET /requests/:id/questions` (agrupadas por profesional), `POST /requests/:id/questions/:questionId/answer`.
- **Baja de cuenta**: borra plantillas, consultas (las del profesional y las de las solicitudes del cliente) y respuestas a reseñas.

## Detalle de presupuestos

- El profesional puede incluir `note` y `estimatedDuration` opcionales al crear o editar. Los ítems conservan su orden (`sortOrder`); materiales se calculan en el servidor sumando cantidades por precio unitario. Cantidades admiten hasta dos decimales; importes de mano de obra, materiales y precio unitario se validan como pesos enteros ARS. `totalAmount` es mano de obra más materiales. Las solicitudes antiguas sin estos campos siguen siendo válidas y los montos ya guardados conservan su precisión.
- `PATCH /pro/quotes/:id` actualiza el mismo presupuesto PENDING, mantiene `createdAt`, refresca `updatedAt` y no consume otra oportunidad Free. Los estados no editables siguen rechazando cambios; una quote aceptada queda inmutable en backend.
- El detalle del cliente recibe los valores persistidos actuales y muestra el desglose plegable, nota y duración cuando existen. Analytics cuenta el importe aceptado del presupuesto una sola vez.

### "Invalid Signature" al subir (foto o matrícula)

Cloudinary muestra el "String to sign": si es `allowed_formats=…&public_id=…&timestamp=…` el armado es correcto (está probado contra el ejemplo oficial) y el problema es la credencial o el algoritmo. `npm run cloudinary:check` (en Render: Shell; local: `cloudinary:check:dev`) lo dice sin imprimir secretos:

- **Credenciales rechazadas por el Admin API** → `CLOUDINARY_API_SECRET` no es el secret de esa `CLOUDINARY_API_KEY` (copiá el de la misma fila en *API Keys*, con el ojo; no el asterisco ni la key).
- **Credenciales válidas, SHA-1 rechazada y SHA-256 aceptada** → la cuenta firma con SHA-256: `CLOUDINARY_SIGNATURE_ALGORITHM=sha256`.
- Sube y borra una imagen de 1×1 px en `resuelve/healthcheck`.

## Ubicación del trabajo

- **Proveedor encapsulado** (`location/location-provider.ts`): `autocomplete`, `geocode` (placeId o texto) y `reverseGeocode`. `DisabledLocationProvider` (default) o `GoogleLocationProvider` (Places Autocomplete New con sesgo al centroide de la localidad del pedido —dato público del catálogo— y Geocoding en español, región AR). Los endpoints reciben `localityId`; sin él (clientes viejos) se usa `LEGACY_LOCALITY`. Ningún componente ni servicio llama a Google directo; la key nunca sale del backend.
- **Barrio inferido** (`location/zone-inference.ts`): 1) el barrio que informa el proveedor coincide con una zona activa; 2) la dirección nombra UNA sola zona (palabras completas). Si no, `zone: null` y la UI pide elegir el más cercano. Nunca por cercanía (no hay límites de barrios). Una dirección de otra localidad → `outsideCity`, y `suggestedLocality` propone la localidad del catálogo que coincide en nombre y provincia (solo si hay una): la persona confirma, nunca se cambia sola.
- **Privacidad**: todo por POST (ni direcciones ni coordenadas en URLs o logs de acceso), sin persistir nada y sin devolver coordenadas. La regla no cambia: los invitados ven el barrio; la dirección exacta, solo el elegido.
- Sin proveedor la app funciona igual: dirección escrita a mano + barrios reales.

## Localidades (multiciudad)

Detalle completo, decisiones y despliegue en `docs/multiciudad.md`.

- **Catálogo:** `provinces` (24, código INDEC/Georef) → `cities` (= localidades; en la API "locality") → `zones` (barrios, opcionales). Una localidad se identifica por id, código oficial o (provincia, slug): nunca solo por el nombre. Slug único por provincia; homónimos en la misma provincia llevan el departamento.
- **`npm run geo:import`** (`geo:import:dev` con ts-node): descarga el JSON oficial de localidades censales (`--url` o `--file` para otro origen, `--dry-run` para ver sin guardar), actualiza por código oficial, vincula ciudades cargadas a mano (Tandil conserva su id) y nunca borra ni cambia un slug publicado. Nunca se consulta Georef en una búsqueda.
- **Solicitudes:** `city_id` obligatorio (localidad del trabajo) y `zone_id` opcional; con barrios cargados, el barrio es obligatorio. FK compuesta (barrio ↔ localidad). Cambiar de localidad, solo en borrador. Un trigger deriva la localidad del barrio para inserts de un backend anterior (ventana de deploy).
- **Compatibilidad:** `LEGACY_LOCALITY` (default `buenos-aires/tandil`) es la localidad que se asume solo para clientes del contrato anterior (`coversEntireCity`/`zoneIds` sueltos sin localidad principal; `/location/*` sin `localityId`).

## Núcleo profesional: cobertura, perfil y matrícula

Las reglas viven en `src/professionals/professional-rules.ts` (una sola fuente para ficha pública, búsqueda, invitaciones y presupuestos). `requestIneligibility(perfil, { service, cityId, zoneId })` es la regla "puede recibir esta solicitud"; la búsqueda aplica el mismo criterio en SQL (`COVERS_LOCALITY_SQL`).

**Cobertura (multiciudad, ver `docs/multiciudad.md`).** Un perfil cubre una o varias localidades (`professional_localities`, con una principal `primary_city_id`); en cada una, toda la ciudad (`covers_entire_city` de esa fila) o sus barrios (`professional_service_areas`). Primero la localidad del trabajo, después el barrio (`coverageGap`): una solicitud de Mar del Plata nunca le llega a quien solo cubre Tandil (`LOCALITY_NOT_COVERED`). "Toda la ciudad" **no es una zona**. Una localidad sin barrios cargados solo se cubre entera. Al pasar a "toda la ciudad" los barrios guardados se conservan (y se ignoran), así al volver a "Solo algunos barrios" se recuperan. `professional_profiles.covers_entire_city` es legacy (espejo de la localidad principal). Una zona desactivada (`active = false`) deja de matchear para todos. No existe texto libre como zona ("Otro barrio"): un barrio nuevo se suma al catálogo.

**Estado del perfil** (decidido por el backend):

| Estado | Cómo | Efecto |
|---|---|---|
| Público | `status = ACTIVE` | Búsquedas, ficha e invitaciones. Sin servicios habilitados, igual se ve en búsquedas sin filtro de servicio |
| Oculto | `status = PAUSED` (`PATCH /pro/status`) | Fuera de búsquedas, ficha `404` e invitaciones nuevas `422`. No toca historial ni "Atiendo urgencias" |
| Inactivo / suspendido | — | No modelado: no hay moderación de perfiles todavía |

**Matrícula por servicio** (`service.requiresLicense`, nunca por nombre):

| Estado (lo ve el profesional) | Significa | Público |
|---|---|---|
| `NOT_SUBMITTED` | No hay envío (no es una fila) | Se publica, sin sello |
| `PENDING` | Enviada, en revisión | Se publica, sin sello |
| `VERIFIED` | Aprobada y vigente | Se publica con "Matrícula verificada"; `verifications.licenses` muestra `{ serviceId, reference }` |
| `REJECTED` | Rechazada con motivo legible (`rejectionReason`) | Se publica, sin sello; se puede reenviar |
| `EXPIRED` | Aprobada con `expiresAt` vencido: deja de contar en el acto; se persiste al reenviar | Se publica, sin sello |

**La matrícula no restringe** (desde el 10/10/2026): todo servicio activo que ofrece el profesional se publica, recibe invitaciones y se puede presupuestar. La matrícula verificada es una señal opcional: el sello y el filtro `?licenseVerified=true`.

- Cada envío es una fila nueva: rechazadas y vencidas quedan como historial. Un índice único parcial impide dos activas (`PENDING`/`VERIFIED`) por profesional, tipo y servicio.
- `?licenseVerified=true` significa "matrícula aprobada y vigente de un servicio que ofrece"; con `service`, **de ese servicio**.
- Lo público nunca incluye pendientes, rechazos, motivo, revisor, documento ni `publicId`. `/pro/me` tampoco trae el documento (solo `hasDocument`).
- Quitar un servicio solo lo saca de búsquedas: solicitudes, presupuestos y verificaciones anteriores no se tocan.

**Qué se verifica: el número.** El profesional carga el número (o referencia) de matrícula; el revisor lo busca en el **registro oficial** del servicio y confirma que esté vigente y a nombre de ese profesional (el nombre de la cuenta). Para Gas, los gasistas matriculados figuran en la distribuidora de la zona (en Tandil, Camuzzi). Para Electricidad hay que confirmar qué registro corresponde antes de aprobar. Escribir el número no verifica nada: siempre decide un revisor.

**Documento de respaldo (opcional, upload privado).** Sirve cuando el número no aparece claro en el registro. Sin documento el envío funciona igual, también sin Cloudinary configurado. Proveedor: Cloudinary, recursos `type=private` (no hay URL pública).

1. `POST /pro/verifications/upload { serviceId }` → firma temporal que fija `public_id` (`resuelve/verifications/<professionalProfileId>/<uuid>`, sin email/DNI/teléfono), tipo privado y formatos (`pdf, jpg, png, webp`). Límite: 10 MB. Rate limit por minuto.
2. El navegador sube el archivo **directo** a Cloudinary (no pasa por Render ni por Postgres).
3. `POST /pro/verifications { type: LICENSE, serviceId, reference, documentPublicId?, expiresAt? }` (`reference` obligatoria). El backend verifica que el `publicId` sea de su carpeta (uno ajeno → `404`), consulta a Cloudinary el formato y el peso **reales** (no la extensión) y, si no cumplen, borra el archivo y responde `422 INVALID_DOCUMENT`. Persiste solo `publicId`, formato y peso.

**Panel de matrículas: `/admin/matriculas`** (frontend) sobre `GET/POST /admin/verifications…` (backend).

**Precio de PRO: `/admin/precio`** (frontend) sobre `GET /admin/pricing` y `PUT /admin/pricing { monthlyPriceArs }` (entero 1–10.000.000, el piso de $1 es para probar el cobro real con montos mínimos y la UI avisa "precio de prueba"; solo `is_admin`, 404 al resto; igual al vigente → 409 `PRO_PRICE_UNCHANGED`). Cada cambio es una fila de `pro_price_changes` (nunca se edita ni borra: historial con quién y cuándo; `pg_advisory_xact_lock` para que `previous_price_ars` sea siempre el vigente). **Rige solo para suscripciones nuevas**: `/plans`, el checkout, la promo (`offerPricing`) y "Tu mes" leen el precio nuevo; las suscripciones ya creadas conservan su monto en Mercado Pago y en `billing_subscriptions` (no se migran en silencio: subirles el precio exige una decisión de negocio y el consentimiento del proveedor). Un checkout PENDING con el precio viejo no se reutiliza. La respuesta trae además la promo resultante y cuántas suscripciones vivas hay por monto.

**Usuarios: `/admin/usuarios`** (frontend) sobre `/admin/users` (backend, `admin-users.controller.ts` + `admin-users.service.ts`; solo `is_admin`, 404 al resto):

- `GET /admin/users?q=&kind=active|professionals|clients|admins|deleted&page=` → `{ items, total, page, pageSize: 25 }`. `q` busca en email y nombre (`%`/`_` literales). Cada ítem trae perfil profesional (estado y PRO efectivo con `EFFECTIVE_PRO_SQL`), admin y baja.
- `GET /admin/users/:id` → `{ user, activity, blockers, plan }`: solicitudes, presupuestos, trabajos, reseñas escritas/recibidas, suscripciones vivas y `counterparts` (otras cuentas con las que tuvo solicitudes, invitaciones, presupuestos o reseñas). `blockers` = los de la baja de cuenta.
- `POST /admin/users/:id/deactivate` → **Dar de baja**: la misma baja de cuenta (`AccountService.deleteAsAdmin`, ver "Baja de cuenta"): anonimiza, conserva el historial ajeno, mismos bloqueos (409 `ACCOUNT_DELETE_BLOCKED`). Idempotente. Es la opción para una persona real.
- `plan` (solo con perfil profesional): `{ tier, source, manualActive, manualUntil, billingProUntil, transferProUntil, bonusProUntil, subscription, billingEnabled }`; `subscription` = la viva o la última autorizada (`status`, monto, próximo cobro, `accessUntil`).
- `POST /admin/users/:id/plan/grant { days? }` → **Dar PRO**: PRO manual de cortesía (`plan_tier = PRO`, `plan_expires_at` = hoy + `days` 1–3650, sin `days` = sin vencimiento; lo mismo que `plan:set --plan PRO --courtesy`, no marca `first_paid_pro_at`). Con lock del perfil. 409 `ADMIN_PLAN_BLOCKED` si la cuenta está dada de baja o paga una suscripción `ACTIVE`/`PAST_DUE` (se le seguiría cobrando: cancelarla antes). 404 sin perfil profesional.
- `POST /admin/users/:id/plan/revoke` → **Quitar PRO manual** (`FREE`, sin vencimiento). No toca billing ni bonus.
- `POST /admin/users/:id/plan/transfer { months, amountArs, note? }` → **Anotar pago por transferencia** (PRO pago, no cortesía): ver "PRO por transferencia".
- `POST /admin/users/:id/subscription/cancel` → **Cancelar suscripción**: llama a `BillingService.cancel`, la MISMA regla que "Cancelar" en Mi plan (reconcilia, cancela en Mercado Pago, PRO hasta `paidThrough`). No reembolsa. Sirve también con la cuenta dada de baja. 409 `BILLING_NO_SUBSCRIPTION` · 502 `BILLING_PROVIDER_ERROR` (no cambia nada) · 503 `BILLING_NOT_CONFIGURED`. Las tres acciones de plan valen también para la propia cuenta y quedan en el log (`AdminUsers`).
- `POST /admin/users/:id/purge { confirmEmail }` → **Borrar definitivamente** (`AccountService.purge`), pensado para cuentas de prueba: `DELETE` de la fila y CASCADE de todo lo que cuelga, **también lo compartido con otras personas** (la UI lo avisa con `counterparts`). Exige escribir el email actual (422 `ADMIN_CONFIRM_MISMATCH`). En una transacción: borra antes avatar, trabajos realizados y documentos en Cloudinary (si falla, 502 `ACCOUNT_DELETE_FAILED` y no cambia nada); borra explícitamente `appointments`/`jobs` de esos presupuestos (sus FK a `quotes` son `RESTRICT` y frenarían el CASCADE: un `DELETE FROM users` a mano falla con un trabajo agendado); libera el email y recalcula rating y trabajos de los profesionales que reseñó o contrató (`recalculateProfessionalMetrics`). No cancela una suscripción en Mercado Pago: la UI lo avisa y se cancela antes con "Cancelar suscripción" (un aviso posterior de esa suscripción se ignora como desconocido).
- Nunca la propia cuenta ni la de otro admin (409 `ADMIN_USER_PROTECTED`): el rol se quita antes con `npm run admin:grant -- <email> --revoke`. El access token vigente (≤ 15 min) no se revoca; refresh tokens y login sí.
- Encabezado del panel: un solo `AdminHeader` (`features/admin/admin-header.ts`) con las cuatro secciones. Tests: `test/admin-users.e2e-spec.ts`.

- Solo entra una cuenta con `users.is_admin = true`. El rol se lee de la base **en cada pedido** (no viaja en el token): quitarlo corta el acceso al instante.
- Para cualquier otra cuenta la API responde el mismo `404` que una ruta inexistente, y el frontend lo manda al inicio. El panel no figura en Swagger, no se prerenderiza y no aparece en ningún menú salvo en el de la cuenta admin.
- **No hay endpoint para volverse admin.** Se otorga solo desde la terminal, con acceso a la base:

```bash
npm run build
npm run admin:grant -- vos@ejemplo.com            # da acceso (la cuenta tiene que existir)
npm run admin:grant -- vos@ejemplo.com --revoke   # lo quita
npm run admin:grant -- list                       # quiénes tienen acceso
```

  Contra producción, igual que el CLI de revisión (variables solo en esa terminal); pide escribir `GRANT` / `REVOKE`. Después de otorgarlo, cerrar sesión y volver a entrar.
- El panel muestra cuántas hay para revisar, el número a verificar (con "Copiar"), dónde buscarlo según el servicio, el documento si hay (link firmado de 10 min), envíos anteriores y el perfil público. Aprobar (con vencimiento opcional) o rechazar (motivo de 5 a 300 caracteres, lo ve el profesional) y pasa a la siguiente.
- Aprobar/rechazar son condicionales (`UPDATE … WHERE status = 'PENDING'`): si dos sesiones (o el panel y el CLI) deciden a la vez, gana la primera y la otra recibe `409 VERIFICATION_ALREADY_REVIEWED`. Queda registrado quién revisó (`reviewed_by` = email del admin; el profesional no lo ve).

**Moderación por terminal: `npm run verification:review`** (mismo servicio que el panel; sirve de respaldo):

```bash
npm run build
npm run verification:review -- list                      # pendientes
npm run verification:review -- show <id>                 # datos, cómo verificar y link firmado al documento si hay (vence en 10 min)
npm run verification:review -- approve <id> [--expires 2027-12-31] [--reviewer nombre] [--purge-document]
npm run verification:review -- reject <id> --reason "La imagen no permite leer el número." [--purge-document]
npm run verification:review -- purge <id>                # borra el archivo y conserva la metadata
```

Contra **producción** (Render Free no tiene shell): correrlo desde una máquina local con las variables en el entorno de esa terminal, sin guardarlas en archivos del repo:

```bash
export DATABASE_URL='<External Database URL de Render>' DATABASE_SSL=true
export CLOUDINARY_CLOUD_NAME=… CLOUDINARY_API_KEY=… CLOUDINARY_API_SECRET=…
npm run verification:review -- list
```

Si la base no es local (o `NODE_ENV=production`) cada escritura pide escribir la acción (`APPROVE`, `REJECT`, `PURGE`) antes de modificar nada. El CLI nunca imprime la URL de la base ni secretos. El link de `show` es solo para quien revisa: no se guarda ni se loguea. Aprobar o rechazar impacta en la búsqueda en el acto (no hay caché).

**Retención de documentos.** TODO: la política de conservación no está definida. Por defecto el archivo se conserva; `--purge-document` / `purge` lo borra después de la decisión y deja estado, referencia y fechas.

## Canales de contacto (WhatsApp, llamadas, solicitudes)

Reglas en `src/professionals/contact/` (`contact-rules.ts` es la única fuente; `phone.ts` normaliza y arma los enlaces).

- **Configuración:** `PATCH /pro/contact` reemplaza todo: `whatsappEnabled`, `callsEnabled`, `requestsEnabled`, `whatsappNumber`, `phoneNumber`, `phoneKind` (`MOBILE`/`LANDLINE`, para un número argentino que no aclara) y `consent`. Al menos un canal (`CONTACT_CHANNEL_REQUIRED`, y CHECK en la base). WhatsApp o llamadas exigen número válido (`INVALID_PHONE` con `details.field`) y consentimiento explícito (`CONTACT_CONSENT_REQUIRED`); `contact_consent_at` guarda cuándo lo aceptó. `consent: false` retira el consentimiento: apaga WhatsApp y llamadas y borra los números.
- **Teléfonos:** columnas propias (`contact_whatsapp_number`, `contact_phone_number`), separadas de `users.phone`, que nunca se publica ni se copia. Se guardan en E.164: `+549…` celular, `+54…` fijo, `+<país>…` internacional. Se aceptan "0249 15 412-3456", "+54 9 249 412-3456", "(011) 15-1234-5678", etc. (el número nacional argentino tiene 10 dígitos y empieza por 11, 2 o 3).
- **Público:** `presentPublicProfessional` → `contactChannels { whatsapp, phone, requests }`, sin números. El número se entrega por canal con `POST /professionals/:id/contact` (`{ channel, sessionKey? }`, público, `THROTTLE_CONTACT_LIMIT` por IP y minuto, default 20, `Cache-Control: no-store`) → `{ channel, href, number, display }` (`https://wa.me/549…?text=…` con un saludo sin datos del cliente, o `tel:+…`). 404 si el perfil no es público o el canal no está disponible. Es un freno razonable al scraping, no una garantía: un número publicado puede copiarse.
- **Clics:** el mismo endpoint registra `WHATSAPP_CLICK` / `PHONE_CLICK` en `exposure_events` (anónimo: hash de la clave de sesión, sin número; uno por canal + sesión cada 30 min; el propio profesional no cuenta). No entran por `POST /analytics/events`. `GET /pro/analytics/month` → `exposure.whatsappClicks` / `phoneClicks`. Un clic no crea solicitudes ni presupuestos, no consume cupo Free, no fija `first_success_at` y no es un trabajo.
- **Solicitudes por Resuelve apagadas:** `requestIneligibility` → `REQUESTS_DISABLED` al invitar (sigue apareciendo en búsquedas y urgencias); lo ya recibido se presupuesta igual (`checkCoverage: false`) y los trabajos en curso no cambian. "Volver a contratar" (`canRehire`) también lo respeta.
- **Urgencias:** `takes_urgencies` (permanente; `available_until` quedó sin uso). Con `availableToday=true` la búsqueda ordena primero a quien tiene WhatsApp o llamadas (`HAS_DIRECT_CONTACT_SQL`), después del espacio destacado PRO.
- **Alta profesional (front):** después de "Publicar perfil", `/soy-profesional` muestra "¿Cómo querés recibir clientes?" con el mismo formulario de Mi perfil (`ContactChannelsForm`) y guarda con este mismo `PATCH /pro/contact`. Es opcional: "Configurar más tarde" no manda nada (queda solo solicitudes por Resuelve) y `POST /pro/profile` no cambió. Si el guardado falla, el perfil ya creado sigue y se reintenta ahí o desde Mi perfil (`/pro/perfil?editar=contact`). Quien no tiene WhatsApp ni llamadas ve en Mi perfil un aviso descartable (se recuerda en `localStorage`, por perfil).
- **Migraciones:** `PermanentUrgencies` (backfill desde `available_until` vigente) y `ContactChannels` (perfiles existentes: solo solicitudes por Resuelve). Ambas con `down` probado (apply → revert → apply en `test/contact-channels.e2e-spec.ts`).

## Planes, entitlements y destacados

- **Modelo:** dos fuentes de PRO que conviven. **Manual:** `professional_profiles.plan_tier` (`FREE`/`PRO`) + `plan_expires_at` opcional (`plan:set` o "Dar PRO" en `/admin/usuarios`). **Billing:** `professional_profiles.billing_pro_until`, derivado de la suscripción de Mercado Pago (solo lo escribe la reconciliación). Plan **efectivo** (`plans/plan.ts` → `planSource`/`effectivePlan`/`resolveProfessionalEntitlements`, y `EFFECTIVE_PRO_SQL`): PRO manual vigente **o** billing vigente; al vencer vuelve a FREE en el acto, sin borrar nada ni jobs. Un webhook nunca baja un PRO manual y `plan:set --plan FREE` no corta una suscripción paga.
- **Entitlements** (única fuente, `entitlementsFor`): `canSendUnlimitedQuotes`, `canBeFeatured`, `canUseAdvancedAnalytics`, `canSeeExposureAnalytics`, `canUseQuoteTemplates` (apagado por `PRO_FEATURE_FLAGS` hasta que exista), `portfolioWorkLimit` y `canUseCoverPhoto` (portada). `/pro/me` devuelve `plan: { tier, source (MANUAL | BILLING | null), expiresAt (solo manual), entitlements }` y `quoteUsage`; el perfil público solo `pro: boolean`.
- **Cupo FREE** (`plans/quote-quota.ts`, `freeQuoteLimit`): `FREE_QUOTE_LIMIT` oportunidades discovery distintas respondidas **en total** después del primer éxito (no es mensual). El default del código es 3; el valor que rige en producción lo define la configuración del entorno (Render), que esta documentación no afirma: se consulta con `GET /plans`. Los tests e2e fijan 5 (`test/app.harness.ts`), por eso los ejemplos "4/5" y "5/5" de abajo y de la tabla de pruebas. `quote_quota_usages` registra únicamente una primera respuesta que consume Free; trial, solicitudes dirigidas y ediciones no suman. No se reinicia por mes. `POST /pro/requests/:id/quote` bloquea el perfil, así dos envíos simultáneos con N-1 de N usadas terminan exactamente en N (ejemplo con el cupo de 5 de los tests: 4/5 → 5). PRO y `FIRST_SUCCESS_TRIAL`: `limit`/`remaining` en null. Al primer quote aceptado, el trial termina y Free empieza en 0/N.
- **Elegibilidad para destacados** (`featuredIneligibility` + `FEATURED_ELIGIBLE_SQL` en `professional-rules.ts`): además del entitlement `canBeFeatured`, perfil `ACTIVE`, al menos un servicio activo y cobertura ("Todo Tandil" o un barrio activo). La usan la búsqueda (quién compite por un espacio), la vitrina `?pro=true` y `/pro/me` → `featured { eligible, reason }` (`NOT_PRO`, `PROFILE_PAUSED`, `NO_PUBLIC_SERVICE`, `NO_COVERAGE`).
- **"Quiero PRO"** (`POST /pro/plan/interest`, solo profesionales): guarda `professional_profiles.pro_interest_at` la primera vez (migración `ProInterest`) y devuelve `/pro/me`. No cambia el plan ni cobra; `plan:set -- list` muestra quiénes lo pidieron y todavía no tienen PRO vigente. El perfil público no lo expone.
- **Oferta de bienvenida `PRO_FIRST_MONTH_20`** (`plans/pro-offers.ts`, única fuente; migración `ProOffers`): 20 % el primer mes para quien está en Free y ya encontró valor.
  - **Regla** (`offerIneligibility`): plan efectivo FREE + cupo Free con tope + nunca pagó PRO (`first_paid_pro_at`) + no la usó (`pro_offer_redemptions`) + alcanzó `PRO_INTRO_OFFER_MIN_FREE_USAGE` oportunidades totales (default 9, acotado al cupo; con el default de código de 3 se ofrece al llegar a 3/3, y con el cupo de 5 de los tests, a 5/5; en producción depende del cupo configurado) **o** ya la reservó al pedir PRO. Motivos: `OFFER_DISABLED`, `NOT_FREE`, `NO_FREE_LIMIT`, `USAGE_BELOW_THRESHOLD`, `ALREADY_HAD_PRO`, `ALREADY_REDEEMED`. Sin vencimiento inventado: dura mientras sea elegible o hasta apagarla por config.
  - **Dónde viaja:** `/pro/me` → `proIntroOffer` (`{ eligible: true, offerCode, discountPercent, appliesToCycles, basePriceArs, discountedPriceArs, reserved }` o `{ eligible: false, reason }`) y el 403 `FREE_QUOTE_LIMIT_REACHED` → `details.offer`. La UI decide cuándo mostrarla, nunca si corresponde.
  - **Códigos estables:** cada oferta tiene código y tipo (`INTRO` hoy); sumar `PRO_FOUNDERS` o `PRO_WINBACK` es otro tipo con su regla en `offerIneligibility`.
  - **Una sola vez:** `redeemOffer` bloquea el perfil, revalida en el servidor, inserta la redención con unique (profesional + código) y `ON CONFLICT DO NOTHING` (dos pestañas → una redención, e2e), registra `REDEEMED` y marca `first_paid_pro_at`. Los montos se recalculan de la config (`offerPricing`: $15.000 → $12.000); el frontend solo manda el código. Con billing la oferta se redime con el **primer cobro promocional aprobado** (no al crear el checkout) y la suscripción pasa al precio base (ver "Billing PRO con Mercado Pago").
  - **Manual** (sin billing o para fundadores/QA), por terminal: `npm run plan:set -- <email> --plan PRO --days 30 --offer PRO_FIRST_MONTH_20` (imprime cuánto cobrar el primer mes). `--courtesy` da PRO sin contarlo como pago (fundadores). La migración marca como "ya pagó" a quienes hoy tienen PRO (sin historial, lo conservador).
  - **Embudo** (`pro_offer_events`, sin datos personales): `SHOWN`/`CLICKED` por superficie una vez por día (dedupe), `REDEEMED` una vez. `npm run plan:set -- offers` muestra mostrada · click · pidieron PRO · usada, en profesionales distintos.
- **Nadie se da PRO por la API:** `PATCH /pro/profile` rechaza `planTier`/`plan` (400) y no hay endpoint oculto. PRO sale de un cobro real confirmado por Mercado Pago o, a mano (fundadores, QA), por terminal:

```bash
npm run plan:set -- <email | id de perfil> --plan PRO               # sin vencimiento
npm run plan:set -- <email | id de perfil> --plan PRO --days 90     # PRO temporal (fundadores)
npm run plan:set -- <email | id de perfil> --plan PRO --until 2026-12-31
npm run plan:set -- <email | id de perfil> --plan FREE
npm run plan:set -- <email | id de perfil> --plan PRO --days 30 --offer PRO_FIRST_MONTH_20   # usa la oferta (una vez)
npm run plan:set -- <email | id de perfil> --plan PRO --days 90 --courtesy                   # cortesía: no cuenta como PRO pago
npm run plan:set -- list
npm run plan:set -- offers                                                                   # embudo de ofertas
```

  Contra una base remota pide escribir `PLAN`. Nunca imprime la URL de la base. (`plan:set:dev` corre desde el código fuente.)
- **Tu mes** (`analytics/`): una query con CTEs para el mes y el anterior (sin N+1), otra por semana (1–7, 8–14, 15–21, 22–28, 29–fin, hora de Argentina) y otra por servicio/barrio. Todas filtran por el id del profesional autenticado. Definiciones: solicitudes = invitaciones por `sent_at`; enviados = solicitudes distintas presupuestadas por primera vez en el mes (métrica mensual de Tu mes, independiente del cupo Free total); aceptados y su valor = `accepted_at`; tasa = aceptados de los enviados del mes (`null` sin enviados); agendados = citas `CONFIRMED`/`COMPLETED` con inicio en el mes; realizados = `completed_at`. `previous` es `null` si el mes anterior no tuvo actividad.
- **Exposición** (`analytics/exposure*`): tabla `exposure_events` con solo dos tipos, `SEARCH_IMPRESSION` y `PROFILE_VIEW`; el resto del embudo se deriva de invitaciones, presupuestos y trabajos.
  - Guarda profesional, servicio y barrio buscados (solo ids que existen), urgente, `is_featured_placement`, página, hora del servidor y el sha256 de la clave anónima de sesión. Nunca usuario, IP, dirección ni texto libre.
  - `dedupe_key` único: aparición = profesional + servicio + barrio + urgente + página + sesión; visita = profesional + sesión + bloque de 30 min. `INSERT … ON CONFLICT DO NOTHING`: reintentos y rerenders no suman.
  - `POST /analytics/events` es público (tandas de hasta 50, `THROTTLE_EVENTS_LIMIT`). Si llega con token válido, se descarta la exposición del propio profesional (el guard completa `req.user` en rutas públicas cuando hay token, sin exigirlo).
  - Tu mes PRO agrega por profesional + tipo + fecha (índice) el mes y el anterior: `exposure { impressions, featuredImpressions, profileViews, rates { viewsPerImpression, requestsPerView, acceptance }, previous }`. Tasas en % con un decimal y `null` sin denominador. Free recibe `exposure: null` y, en su lugar, **`proPreview`**: `impressions`, `profileViews`, `whatsappClicks` y `phoneClicks` (solo totales del período —los toques salen de los mismos `WHATSAPP_CLICK`/`PHONE_CLICK` deduplicados de `exposure_events` que ve PRO, sin otra fuente—; desglose, destacados y comparación con el mes anterior siguen siendo PRO, y el permiso se aplica acá, no en el front), `delayedOpportunities` (invitaciones no dirigidas del mes con `available_at > sent_at`: le llegaron después que a PRO), `delayedAfterOtherQuote` (de esas, en cuántas ya había un presupuesto de otro profesional antes de su `available_at`) y `blockedOpportunities` (`FREE_BLOCKED_OPPORTUNITY_VIEWED` distintos del mes). Con PRO, `proPreview` es `null`. `basic.acceptedQuotesValue` (suma de aceptados del mes, no lo cobrado) y `proMonthlyPrice` (precio vigente) llegan a todos los planes.
  - Oportunidad del profesional (`/pro/requests`, `/pro/requests/:id`): `opportunity.lateByMinutes` = minutos entre `sent_at` y la disponibilidad efectiva (0 sin demora o dirigida). En el detalle, `opportunity.quotesBeforeYou` = presupuestos de OTROS creados antes de que se le habilitara (0 si le llegó a tiempo): el momento de la pérdida.
  - Presupuestos del cliente (`GET /requests/:id/quotes`): `professional.pro` (PRO vigente), `professional.workCovers` (portadas de hasta 3 trabajos públicos, solo PRO), `professional.licenseVerified` (matrícula verificada y vigente del servicio de la solicitud) y `professional.averageResponseMinutes` ("Suele responder en…", null con pocas respuestas).
  - Búsqueda (`GET /professionals`): cada ítem PRO vigente trae `workCovers` (hasta 3 portadas, la primera foto activa de sus trabajos activos, del más reciente); Free, `[]`. Única fuente: `professionals/work-photos/work-covers.ts` (`workCoversFor`, una consulta por página; `WORK_COVERS_PER_PROFESSIONAL`).
- **Tiempo de respuesta** (`professionals/response-time.ts`): `average_response_minutes` = mediana de los minutos entre `available_at` de la invitación (así la demora de acceso anticipado no le cuenta a un Free) y su primer presupuesto, sobre sus últimas `RESPONSE_TIME_SAMPLE` (20) respuestas; con menos de `RESPONSE_TIME_MIN_SAMPLE` (3), `null`. Lo recalcula la transacción que crea un presupuesto (única escritura); la migración `1794800000000-ResponseTime` lo calculó para todos con lo que ya había. Público como `averageResponseMinutes`, junto con `memberSince` (alta del perfil).
- **Orden de la búsqueda** (`sort`): `recommended` (default), `rating` (con reseñas primero), `reviews` o `response` (`NULLS LAST`); valor inválido → 400. Ninguno mira el plan y los destacados se ubican después igual que siempre.
- **Destacados** (`plans/featured-placement.ts`): el backend ordena la búsqueda orgánica (disponibles hoy, rating, reseñas, o el `sort` elegido) y después ubica los PRO:
  - compiten solo PRO vigentes que YA cumplen todos los filtros y reglas (perfil activo, servicio, cobertura del barrio);
  - espacios: el 1.º arriba y cada siguiente 5 lugares más abajo; se abren con volumen (`FEATURED_RESULTS_PER_SLOT` resultados por espacio, tope `FEATURED_SLOTS`) y con 0–1 resultado no hay;
  - un destacado siempre sube: si ya está a esa altura orgánicamente, queda orgánico (sin rótulo);
  - rotación: hash estable de (día de Argentina + servicio + barrio + id), así rota día a día y no cambia mientras se pagina;
  - nadie desaparece ni se duplica; los FREE conservan su orden relativo. Cada ítem trae `isFeaturedPlacement` para rotularlo "Destacado".
  - Se traen los ids de todos los resultados (una ciudad: decenas o cientos) y se pagina después; con volumen de otra escala habría que acotar la ventana de candidatos.

## Prueba de PRO

`plans/pro-trial.ts` (única regla), migración `1795000000000-ProTrial`.

- **Quién:** Free después del primer cliente (`first_success_at`); antes ya responde sin límite y sin demora. Nunca a quien ya pagó PRO (`first_paid_pro_at`), ya tuvo una prueba o tiene PRO vigente de cualquier fuente (referidos incluidos). Motivos (`proTrialIneligibility`): `TRIAL_DISABLED`, `ALREADY_HAD_TRIAL`, `ALREADY_PAID_PRO`, `NOT_FREE`, `BEFORE_FIRST_SUCCESS`.
- **Cómo:** opt-in. `POST /pro/plan/trial` bloquea el perfil, revalida, inserta `pro_trials` (única por perfil: dos pestañas → una prueba; guarda inicio, fin, días y el cupo Free que le quedaba) y suma `PRO_TRIAL_DAYS` (7, `PRO_TRIAL_ENABLED`) a `bonus_pro_until`, la misma fuente que los referidos: `planSource` = `BONUS` y `effectivePlan`/`EFFECTIVE_PRO_SQL` no cambian. Sin tarjeta ni cobro; al vencer vuelve a Free por fecha, sin jobs. Registra `PRO_TRIAL_STARTED` (una vez). No toca `first_paid_pro_at`: la oferta de bienvenida sigue disponible después. 409 `PRO_TRIAL_NOT_AVAILABLE` con `details.reason`.
- **`/pro/me` → `proTrial`:** `AVAILABLE { days }` · `ACTIVE`/`ENDED { days, startedAt, endsAt, summaryPending }` · `UNAVAILABLE { reason }`.
- **Resumen** (`GET /pro/plan/trial/summary`, 404 sin prueba o en curso): del inicio al fin, `featuredImpressions` (`exposure_events` destacadas), `earlyOpportunities` (`EARLY_AHEAD_OF_FREE_SQL`), `profileViews` y `quotesAboveFreeLimit` (solicitudes no dirigidas presupuestadas por primera vez durante la prueba menos el cupo Free que le quedaba al empezar). `POST /pro/plan/trial/summary/seen` lo marca visto (idempotente).
- **Reporte:** `funnel:report` suma "Prueba de PRO" y "Prueba → PRO" (cobro aprobado después de empezar la prueba).
- Tests: `test/pro-trial.e2e-spec.ts`, `src/plans/pro-trial.spec.ts`.

## Fase 4 comercial

Que se note que el PRO paga y razones reales para pagar, con datos reales (tests: `test/phase4-commercial.e2e-spec.ts`).

- **La demanda en tu zona** (`analytics/local-demand.ts`, `GET /pro/analytics/month` → `demand`, Free y PRO): pedidos publicados (no `DRAFT`) en el mes de SUS servicios en SU ciudad principal, cuántos ya tenían presupuesto antes de que un Free demorado pudiera verlos (`answeredBeforeFree`) y cuántos OTROS PRO pueden hoy ocupar Destacados en esos servicios y esa ciudad (`otherProProfiles`). Solo conteos: nunca quién pidió ni a quién. `null` sin ciudad, sin servicios o con menos de `LOCAL_DEMAND_MIN_REQUESTS` (3) pedidos.
- **Precio anclado:** `largestAcceptedQuoteValue` = su presupuesto aceptado más alto de siempre (lo acordado, no lo cobrado), para "equivale a N meses de PRO".
- **Resumen semanal de PRO** (`notifications/weekly/pro-weekly-summary.ts` + `ProWeeklySummaryScheduler`, migración `1795100000000-ProWeeklySummary`): aviso `PRO_WEEKLY_SUMMARY` (sección `PROFILE`, ruta `/pro/estadisticas`) con `payload.weekly { featured, early, views }` de la semana anterior (lunes a domingo, hora de Argentina; `early` con `EARLY_AHEAD_OF_FREE_SQL`). Solo a PRO vigente y solo si hubo algo; uno por persona y semana (`dedupe_key` `PRO_WEEKLY_SUMMARY:<perfil>:<lunes>`). El job corre cada hora y crea los avisos desde el lunes a las 9 (`PRO_WEEKLY_SUMMARY_ENABLED`, default true; apagado en tests). Push: `PUSH_COPY.PRO_WEEKLY_SUMMARY` ("Tu semana con PRO", sin números), con el silencio 23–8 de siempre; no va por email.

## Demora de Free y evidencia "antes/después" (Fase 1 de la auditoría)

Pruebas: `test/opportunity-delay.e2e-spec.ts`, `src/requests/opportunity-access.spec.ts`.

- **Cuándo se demora a un Free** (`opportunityAvailableAt`, única regla; usa los resolutores de siempre: `resolveProfessionalAccess` para el plan, `requestIneligibility` para quién puede recibirlo): pedido normal (`FLEXIBLE`), no dirigido, Free posterior al primer éxito sin prueba activa **y** un PRO elegible del mismo pedido con acceso anterior (`proAccessAt`). La espera es `FREE_OPPORTUNITY_DELAY_MINUTES` desde ese acceso del PRO (a quien se suma después le queda solo lo que falta). Hoy y urgente (`DELAY_EXEMPT_URGENCIES`), dirigido y acceso inicial hasta el primer éxito: sin demora.
- **Qué cuenta como "un PRO tuvo acceso antes"** (`requests/delay-evidence.ts`, única fuente): lo registrado cuando pasó, nunca el plan de hoy. Un `EARLY_OPPORTUNITY_DELIVERED` de ese pedido con `billingPlan` PRO/PRO_PLUS y `earlyAccess`, anterior al `available_at` del Free (se graba en la misma transacción que la invitación; no se graba en pedidos de hoy/urgentes). `DELAYED_BEHIND_PRO_SQL` (invitación demorada con ese respaldo) es lo que cuentan Tu mes ("después que a PRO"), "La demanda en tu zona" y el momento de la pérdida (`quotesBeforeYou`, `DELAYED_OPPORTUNITY_UNLOCKED`); `EARLY_AHEAD_OF_FREE_SQL` (el PRO, con un Free demorado registrado en esa solicitud) es lo que cuentan Tu mes, la prueba y el resumen semanal. El aviso del PRO (`payload.aheadOfFree`) sale solo si en esa tanda un Free queda demorado.
- **Solicitudes ya enviadas** (`resolveOpportunityTiming`, al leer; la app no modifica `request_invitations` ni los eventos): una demora guardada **sin** acceso anticipado de un PRO registrado en ese pedido se puede responder ya y no se presenta (`lateByMinutes` 0) ni se cuenta como hecho; una de hoy/urgente **solo es un hecho si hay prueba estable de que la espera se cumplió**: `request_invitations.delay_served_at`, que deja la migración `ServedExemptDelays` para las esperas que ya habían vencido cuando se aplicó (con el código anterior se hacían cumplir). Sin esa marca (esperas que seguían por delante, o creadas durante un despliegue) se puede responder ya y **no es una demora**: ni `lateByMinutes`, ni `quotesBeforeYou`, ni `DELAYED_OPPORTUNITY_UNLOCKED`, ni los contadores SQL (`DELAY_OCCURRED_SQL`) la cuentan, **se lea cuando se lea**: la misma invitación da lo mismo a los 5 que a los 35 minutos, antes o después del `available_at` original y haya o no un presupuesto enviado antes del vencimiento. La aplicación nunca escribe `delay_served_at`. Una demora demostrada sigue igual. La migración `ReleaseUnprovenFreeDelays` solo adelanta el aviso "Nueva solicitud" de esas demoras pendientes que no se justifican (no toca invitaciones; sin `down`: un aviso liberado no se vuelve a demorar).
- **Limitación conocida:** una invitación demorada de antes cuyo PRO nunca tuvo el evento (p. ej. PRO invitado con la demora apagada) no se puede demostrar y se trata como sin evidencia.
- **"Suele responder en…" con históricos** (`response-time.ts`, `EFFECTIVE_ACCESS_SQL`): mide desde el acceso efectivo, la misma regla que `resolveOpportunityTiming`. Cuenta el `available_at` guardado solo si la demora está demostrada (un PRO del mismo pedido la tuvo antes, pedido normal y no dirigido); si no (demora sin evidencia, hoy/urgente), cuenta desde `sent_at`. Así una solicitud que hoy se libera antes de su `available_at` guardado no se descarta ni da tiempos artificialmente bajos, y no se "corrigen" negativos a cero. Una demora sin evidencia suficiente se trata como sin demora.

## Sugeridos antes de enviar: solo quien puede responder (hallazgo 3b)

Los sugeridos de "Revisá tu pedido" y "Sumá otro para comparar" (pantalla de envío) ya no salen solo del listado: el front
junta hasta 12 candidatos que pueden **recibir** el pedido (servicio, localidad, barrio, urgencia, sin Destacados pagos en los
sugeridos) y pregunta a `POST /requests/eligible-recipients` (público, con límite de escrituras) quiénes pueden **responderlo**.

- Una sola regla: `assessInvitees` / `inviteBlock` (`requests/invitation-eligibility.ts`), la misma de `POST /requests/:id/invitations`
  y de "Sumar profesionales". Descubrimiento (`targeted: false`): sin cupo Free queda afuera; el acceso inicial hasta el primer éxito
  no tiene tope; perfil pausado, solicitudes apagadas, servicio o cobertura incompatibles quedan afuera.
- Devuelve solo `{ eligibleIds }` en el orden recibido: nunca el motivo ni el cupo de nadie.
- Es una foto de ese momento. El envío **revalida** y, si algo cambió, responde 422 `PROFESSIONAL_NOT_ELIGIBLE` (la pantalla lo
  explica y ofrece buscar otro; el pedido queda guardado). Los pedidos dirigidos y sus excepciones no cambian.
- **Las recomendaciones revisan una selección limitada del listado** (los primeros 12 candidatos que pueden recibir el pedido, en el orden orgánico), no todo el catálogo: alguien más abajo podría poder responder. Por eso el estado vacío no afirma que no haya nadie.
- Sin sugerencias entre los revisados: "No encontramos sugerencias disponibles para este pedido" (con la explicación del contacto directo) y "Ver todos los profesionales"; si la consulta falla, no
  se recomienda a nadie ("No pudimos comprobar…"). Free sin cupo **no** se oculta de búsqueda, perfiles ni contacto directo.
- Sin vencimientos automáticos ni avisos por falta de respuesta.

## Recorrido del pedido del cliente (auditoría original: medir)

Mide cuántas personas **empiezan** un pedido, **hasta qué paso llegan** y cuántas lo **envían**. Reutiliza el patrón de las demás métricas anónimas (`exposure_events`, `pro_funnel_events`: dedupe único, sin PII, errores silenciosos) pero en una tabla propia, `request_journey_events` (migración `RequestJourneyEvents`), porque el cliente puede ser invitado y el embudo del profesional exige un `professional_id`.

**Intento.** Clave aleatoria (UUID) que el navegador crea al empezar un pedido y guarda **dentro del borrador del pedido** (`resuelve.requestDraft` → `journey`, `sessionStorage`): no tiene un vencimiento propio, vive y vence con él (12 h desde la última edición, que renueva ambos; mismo borrador vigente = mismo intento). Sobrevive a la recarga y al paso por `/ingresar`. Se cierra al enviar, descartar o empezar otro pedido (`RequestStore.resetForNewRequest`). Un pedido que pasa de `/solicitud` a resultados y a `/presupuesto` es **un** intento.

**Recorridos** (el reporte nunca mezcla sus pasos; lo decide cómo empezó el intento):

| Recorrido | Empieza | Etapas del reporte |
| --- | --- | --- |
| `REQUEST` | arma el pedido en `/solicitud` (inicio, “Crear solicitud”) | empezó → pasos de la versión (5 en V1, 4 en V2) → pantalla de envío → envío |
| `DIRECT` | un profesional ya elegido (perfil, tarjeta de resultados, recontratar) | empezó → pantalla de envío → envío |
| `COMPARE` | varios elegidos desde resultados, urgencias o sugeridos, directo a `/presupuesto` | empezó → pantalla de envío → envío |

En `DIRECT`/`COMPARE`, los pasos de `/solicitud` (si edita el pedido) se informan aparte como “editaron el pedido”, no como etapa.

**Eventos** (`POST /analytics/request-journey`, público, con límite; en tandas; el navegador los manda ~2 s después o con `keepalive` al ocultar la página):

| Evento | Cuándo | Dedupe |
| --- | --- | --- |
| `STARTED` (+ `entry` = la atribución de entrada del pedido: perfil, resultados, QR…) | se abre el intento | uno por intento |
| `STEP_VIEWED` (`step`: V1 0–4 = Qué necesitás, Urgencia, Dónde, Cuándo, Revisión; V2 0–3 = Qué necesitás, Dónde, Cuándo, Revisión) | se muestra el paso en `/solicitud` | uno por intento, versión y paso |
| `QUOTE_VIEWED` | se muestra `/presupuesto` con profesionales elegidos | uno por intento |
| `AUTH_REQUIRED` | se lo manda a `/ingresar` (envío o perfil sin sesión) | uno por intento |
| `AUTH_RETURNED` | vuelve a una pantalla del pedido **ya autenticado** después de `AUTH_REQUIRED` | uno por intento |
| `SENT` | **solo el backend**: `POST /requests/:id/invitations`, en la misma transacción y solo en el paso `DRAFT → WAITING_QUOTES` (invitaciones realmente creadas). Crear el borrador no cuenta; sumar profesionales después tampoco | `SENT:<intento>`: recargas y reintentos no duplican |

`SENT` se rechaza si llega por la ingesta del navegador. La clave del intento viaja en `journeyAttemptId` (opcional) de las invitaciones; sin ella (cliente viejo o sin medición) se envía igual, sin evento.

**Versión de la interfaz (`flow_version`, migración `RequestJourneyFlowVersion`).** El asistente pasó de 5 pasos (**V1**: Urgencia y Cuándo separados) a 4 (**V2**: urgencia y fecha juntas, `/presupuesto` corto). Cada evento del navegador guarda la versión de la interfaz que **realmente lo emitió** (`flowVersion` en el cuerpo, 1 o 2): el front actual manda 2; una pestaña vieja (sin el campo) es 1, y todo lo registrado antes del cambio se migró como 1. `SENT` es del servidor y **no lleva versión** (NULL, lo exige un `CHECK`): un valor por defecto lo haría "V1" y volvería MIXTO a todo intento de V2. `STEP_LABELS_BY_VERSION` es la única fuente de las etiquetas (V2 acepta pasos 0–3; la tabla lo respalda). La clave de deduplicación de V1 no cambió; la de V2 lleva `v2:` (así el mismo intento puede registrar el paso 1 de cada interfaz). El UUID del intento no cambia: sigue dentro del borrador, con su único vencimiento.

- **Clasificación de un intento** (por los eventos del navegador, nunca por `SENT`): solo V1 → **V1**; solo V2 → **V2**; con eventos de las dos → **MIXTO** (típicamente un borrador abierto en la interfaz anterior y retomado después del cambio). Una recarga dentro de la misma versión no genera otro inicio ni lo vuelve MIXTO.
- **Reporte** (`npm run journey:report`): un bloque por recorrido **y versión**, cada uno con sus etapas y sus propios porcentajes (los pasos de una versión no existen en la otra); **MIXTO aparte**, solo cantidades (intentos, llegaron a la pantalla de envío, con envío), fuera de los porcentajes de V1 y V2; y "Extremos equivalentes" (inicio → pantalla de envío → envío confirmado, los únicos que significan lo mismo en las dos versiones) lado a lado. **Es descriptivo**: son períodos y personas distintos, el mix de entradas puede cambiar, no hay asignación al azar y no prueba que una versión cause la diferencia. Cada bloque mantiene su denominador (intentos maduros) y la ventana de 12 h; un intento sin envío sigue siendo "sin envío registrado", nunca un abandono confirmado.
- **Pérdidas** (igual que antes, ahora por versión): bloqueadores, red cortada o cerrar la pestaña antes del envío diferido pierden eventos; un envío confirmado sin ningún evento previo del navegador se cuenta aparte (no tiene versión que atribuirle).

**Sin datos personales.** Se guarda: clave del intento, tipo, paso, recorrido, entrada, id interno de la solicitud (solo `SENT`) y hora. Nunca nombre, teléfono, email, dirección ni texto del pedido (la ingesta rechaza cualquier otro campo). Está en la Política de Privacidad.

**Reporte** (solo lectura, agregado): `npm run journey:report -- [--from AAAA-MM-DD] [--to AAAA-MM-DD] [--window-hours N] [--json]` (por defecto, últimos 30 días; transacción `READ ONLY`). Un intento pertenece al período por su primer evento. Cada etapa muestra la cantidad que **llegó a ella o a una posterior**, el % de la etapa anterior y el % de los que empezaron (con la cantidad que es el denominador). Además: cuántos pidieron ingresar, cuántos volvieron autenticados y cuántos enviaron después; resultado del intento; cómo llegaron.

**Ventana de observación** (`OBSERVATION_WINDOW_HOURS` = 12, igual que el borrador del navegador). Los porcentajes usan solo intentos que **empezaron hace más que la ventana**; los más recientes todavía pueden completarse y se muestran aparte (con cuántos ya se enviaron). Pasada la ventana, un intento sin envío es “sin envío registrado”, **nunca un abandono confirmado**: cerrar la pestaña no prueba que la persona se haya ido.

**Límites** (leer los números con esto en mente):

- *Bloqueadores y eventos perdidos*: un bloqueador de analítica, una red cortada o cerrar la pestaña antes del envío diferido pierden eventos del navegador. Los envíos confirmados por el servidor **sin ningún evento previo** se cuentan aparte (“sin eventos del navegador”) y no entran en los recorridos; el cociente envío/inicio puede subestimar si faltan inicios.
- *Cambio de dispositivo o pestaña*: el borrador (`sessionStorage`) es por pestaña; empezar en el celular y terminar en la computadora (o abrir el enlace en otra pestaña/navegador, como el de verificación de email) son dos intentos: uno sin envío y otro que empieza tarde. Tampoco se une con cuentas: es anónimo.
- *Sin historial previo*: se mide desde esta migración; no hay datos anteriores ni se reconstruyen.
- *Sin calidad*: no distingue pedidos buenos de malos ni explica por qué alguien se detuvo; es descriptivo, sin causalidad.
- *Claves declaradas por el navegador*: cualquiera puede mandar eventos falsos a la ingesta pública (hay límite por IP); el envío, en cambio, solo lo registra el servidor.
- *Sin purga*: la tabla crece con el uso y no se limpia sola todavía.
- Un borrador que vence de verdad (12 h sin ediciones) cierra su intento: lo que se retome después es otro intento.

## Sumar profesionales a un pedido sin respuesta (Fase 2 de la auditoría)

El cliente puede sumar profesionales a un pedido **enviado** (`WAITING_QUOTES` o `QUOTES_RECEIVED`, con invitaciones y sin profesional elegido) mientras **no tenga presupuestos activos**. `QUOTES_RECEIVED` cuenta porque el estado se corrige de forma perezosa: si los presupuestos anteriores vencieron o se retiraron, el pedido sigue necesitando gente. El backend decide siempre con los presupuestos activos; siga habiendo lugar (menos de `MAX_INVITATIONS_PER_REQUEST` = 6 invitados y de `MAX_ACTIVE_QUOTES_PER_REQUEST` = 5 presupuestos activos). No se espera ningún plazo para ofrecerlo.

- **Recomendaciones:** `GET /requests/:id/invitation-options` (solo el dueño; otro usuario recibe 404). Devuelve `state` (`AVAILABLE`, `LIMIT_REACHED`, `NO_CANDIDATES`, `QUOTES_FULL`, `NOT_APPLICABLE`), lugares (`invited`, `remainingInvitations`, `activeQuotes`…), `emphasis` y las listas `candidates` y `directContacts`. Solo lee: nada se suma ni se avisa por tiempo transcurrido.
- **Énfasis:** `URGENT_GUIDE` en pedidos de hoy/urgentes desde el inicio; `SUGGEST` cuando pasaron `ADD_PROFESSIONALS_SUGGEST_AFTER_MINUTES` (60) desde el envío sin presupuestos. Es un umbral inicial **para medir**, no sale de datos; `suggestFrom` permite a la pantalla releer una sola vez, sin polling.
- **Quién puede responder (`requests/invitation-eligibility.ts`, única fuente):** la usan las recomendaciones y `POST /requests/:id/invitations`, que revalida al enviar (la disponibilidad o el cupo pueden cambiar desde que se mostró la lista). Además de poder recibir el pedido (`requestIneligibility`) y atender urgencias si es `URGENT` (`NOT_AVAILABLE_TODAY`), un Free posterior al primer éxito que agotó sus oportunidades discovery **no puede responder una invitación de descubrimiento** (`QUOTA_EXHAUSTED`, 422 `PROFESSIONAL_NOT_ELIGIBLE` con `details.reason`). **Excepciones:** un pedido dirigido (`targeted`: primera invitación, un único profesional) no consume cupo y no se excluye por cupo agotado; el acceso inicial hasta el primer éxito y los PRO no tienen tope. Esto no oculta a nadie globalmente: un Free sin cupo sigue en búsqueda, perfil y contacto directo.
- **Lugares:** se mantiene el máximo de 6 invitados (422 `INVITATION_LIMIT_REACHED`) y, nuevo, sumar a un pedido que ya tiene los 5 presupuestos activos es 409 `REQUEST_QUOTE_LIMIT_REACHED` (sumar gente no sirve sin lugar). Los ya invitados se excluyen y se ignoran en reintentos; el envío bloquea la solicitud, así que reintentos y envíos simultáneos no duplican ni pasan el tope.
- **Contacto directo (`directContacts`):** perfiles activos que cubren el pedido y habilitaron WhatsApp o llamadas (`publicContactChannels`), aunque no puedan responder por Resuelve (Free sin cupo, solicitudes apagadas). El número nunca viaja: se pide con `POST /professionals/:id/contact`. Un clic **no** crea invitación, ni cuenta como presupuesto o trabajo confirmado, ni consume cupo.
- **Medición:** `request_invitations.added_via = 'ADD_PROFESSIONALS'` (migración `InvitationAddedVia`, nullable) marca lo sumado desde la acción, solo si el pedido ya tenía invitaciones (el cliente lo manda en `addedVia`; en el envío original se ignora). `npm run marketplace:report` agrega la sección "Sumar profesionales": pedidos que la usaron sobre los enviados, mediana hasta sumar, cuántos ya tenían presupuesto, cuántos recibieron uno después (y si el primero fue de un sumado) y primer presupuesto dentro de 1 y 24 h desde que se sumó gente, con denominadores y "sin tiempo todavía"/"cancelados antes" aparte. **Es descriptivo**: no hay grupo comparable (quien la usa es quien no recibió respuesta), por eso no se le atribuye causalidad.

## Reporte del marketplace (solo lectura)

`npm run marketplace:report -- --from AAAA-MM-DD [--to AAAA-MM-DD] [--by none|city|service|city-service] [--city <id>] [--service <id>] [--json]` (`analytics/marketplace-report.ts` + `.cli.ts`; test `test/marketplace-report.e2e-spec.ts`). Agregado, sin datos personales ni ids de personas, en una transacción `READ ONLY` sobre la base de `DATABASE_URL`: **consultar producción lo corre una persona con acceso autorizado**; no hay ningún acceso automático. Sin `--from`, los últimos 30 días.

Por período (primera invitación del pedido, horario de Argentina), ciudad y servicio, y siempre separado por modo (búsqueda/dirigido) y urgencia: pedidos enviados (los borradores no cuentan), con y sin presupuesto, primer presupuesto en 1, 24 y 72 h, mediana hasta el primer presupuesto, aceptados y completados. Reglas (también impresas al pie del reporte, `REPORT_NOTES`):

- Cada ventana muestra `respondidos de elegibles (%)`; los pedidos enviados hace menos que la ventana ("sin tiempo todavía") quedan fuera del porcentaje y se informan aparte.
- **Cancelaciones:** un pedido cancelado antes de cumplirse la ventana y sin presupuesto no es "sin respuesta": se informa aparte ("cancelados antes"). Si ya tenía presupuesto a tiempo, cuenta como respondido.
- **Presupuestos retirados:** el primer presupuesto cuenta aunque después se retire o venza (la respuesta ocurrió); los pedidos con todos sus presupuestos retirados se muestran aparte.
- La mediana es sobre los pedidos con presupuesto y va junto a la cantidad sin presupuesto (con muchos sin respuesta o recientes, subestima la espera).
- Cuenta qué pasó, no por qué: no atribuye causas a la falta de respuesta (no hay datos para demostrarlas).
- Reutiliza `service_requests`, `request_invitations` y `quotes`; no agrega instrumentación.

## Embudo del profesional (PRO 2.0 · Fase 0)

Medir antes de optimizar. Sin analytics externo: una tabla propia y lo que ya existía.

- **`professional_profiles.first_success_at`** (migración `ProFunnel`): primer presupuesto **aceptado por un cliente** (evento objetivo: no depende de que el profesional marque "realizado"). Se escribe en la transacción de `POST /quotes/:id/accept` con `UPDATE … WHERE first_success_at IS NULL`: una sola vez, nunca vuelve a `null`. La migración lo completa con el primer `accepted_at` real de cada profesional.
- **`pro_funnel_events`** (`funnel/`): `type`, `professional_id`, `ref` opcional (id de solicitud, cobro, suscripción o superficie; nunca PII), `occurred_at` y `dedupe_key` único (`INSERT … ON CONFLICT DO NOTHING`, dentro de la transacción de la acción). `FUNNEL_DEDUPE` define cuántas veces cuenta cada uno: `ONCE` (una por profesional), `REF` (una por referencia), `DAY` (superficie + día de Argentina) y `MONTH` (mes de Argentina).

| Evento | Lo registra | Cuenta |
|---|---|---|
| `PROFESSIONAL_REGISTERED` | `POST /pro/profile` | una vez |
| `PROFILE_COMPLETED` | alta/edición/estado del perfil y aprobación de matrícula, cuando queda activo + titular + un servicio activo + cobertura | una vez |
| `FIRST_COMPATIBLE_OPPORTUNITY_RECEIVED` | primera solicitud que recibe | una vez |
| `FIRST_QUOTE_SENT` / `FIRST_QUOTE_ACCEPTED` / `FIRST_SUCCESS_REACHED` | primer presupuesto / primer aceptado (= primer éxito) | una vez |
| `PRO_PLAN_VIEWED` / `PRO_CTA_CLICKED` | frontend (`POST /pro/funnel-events`, superficie) | por superficie y día |
| `PRO_CHECKOUT_STARTED` | `POST /billing/pro/checkout` (suscripción nueva); `context.billingPlan` = `PRO` \| `PRO_PLUS` | por suscripción |
| `PRO_PAYMENT_APPROVED` / `PRO_RENEWED` | reconciliación de un cobro aprobado por Mercado Pago, o un admin que aprueba la transferencia (renovación = ya había otro cobro aprobado); `context.billingPlan` en el cobro | por cobro |
| `PRO_CANCELLED` | cancelar desde Resuelve o desde Mercado Pago | por suscripción |
| `FREE_QUOTE_USED` | presupuesto que consume cupo Free | por solicitud |
| `FREE_QUOTE_LIMIT_REACHED` | intento con el cupo agotado (fuera de la transacción revertida) | una vez por profesional |
| `FREE_BLOCKED_OPPORTUNITY_VIEWED`, `EARLY_OPPORTUNITY_DELIVERED`, `DELAYED_OPPORTUNITY_UNLOCKED`, `FEATURED_ATTRIBUTED_REQUEST` | oportunidades abiertas y atribución (fases 1–2) | por referencia |

- **Medición comercial de Mi plan** (`README.md` → "Página Plan"): lo que se puede medir y sus límites.
  - *Oferta vista*: `PRO_PLAN_VIEWED` con superficie `PLAN_OFFER` (solo cuando un profesional Free tiene las tarjetas de planes y su precio realmente en pantalla (IntersectionObserver; abrir Mi plan sin llegar a ellas no cuenta); un PRO que visita Mi plan no cuenta). `PLAN_PAGE` sigue siendo "visitó Mi plan" (cualquier plan). Una por profesional y día.
  - *Clic en contratar*: `PRO_CTA_CLICKED` con `PLAN_PAGE` (eligió PRO, incluida la transferencia o el pedido manual) o `PLAN_PLUS` (eligió PRO Plus). Es un clic, no una compra; por superficie y día.
  - *Inicio del checkout*: `PRO_CHECKOUT_STARTED`, escrito por el backend al crear la suscripción de Mercado Pago (con el plan). Un clic sin checkout (error del proveedor, transferencia, pedido manual) no lo genera: la transferencia no tiene "checkout", su primer hecho medible es el cobro aprobado.
  - *Pago confirmado*: `PRO_PAYMENT_APPROVED`, solo desde la confirmación del backend (cobro aprobado por el proveedor reconciliado, o transferencia confirmada por un admin), idempotente por cobro. **Volver del checkout o abrir `/pro/plan/resultado` no registra nada.** Test en `billing.e2e-spec.ts` ("medición comercial").
  - Sin datos personales: el evento guarda tipo, profesional interno, superficie/plan y fecha. `funnel:report` agrega "Vistas / clics por superficie" y "Checkout / cobro aprobado por plan" (profesionales distintos de la cohorte).
  - Límites: la cohorte son registrados en el rango (no todos los compradores del período); un clic por superficie y día; eventos de plan anteriores a este cambio figuran como `SIN_DATO`; no hay atribución causal entre ver la oferta y pagar ni se mide el abandono dentro de Mercado Pago.
- Apariciones y visitas (también las de espacios destacados: `is_featured_placement`) siguen en `exposure_events`, y el embudo de la oferta de bienvenida en `pro_offer_events`: no se duplican.
- La migración reconstruye lo que se puede probar con datos reales (alta, primera invitación, primer presupuesto, primer aceptado). "Perfil completo" y todo lo de PRO se cuentan desde el deploy.
- **Reporte** (solo lectura, sin datos personales): `npm run funnel:report [-- --from AAAA-MM-DD --to AAAA-MM-DD]` (`funnel:report:dev` desde el código). Cohorte = registrados en el rango; cada paso cuenta profesionales distintos. Definiciones (`funnel-report.ts`, única fuente): **Activation Rate** = primer presupuesto / registrados; **First Success Rate** = primer éxito / registrados; **Free → PRO** = con cobro PRO aprobado / registrados; **First Success → PRO** = PRO pago después del primer éxito / con primer éxito; **PRO → segundo mes** = con renovación / con cobro aprobado; **Cancelación** = cancelaron / con cobro aprobado. Sin denominador: "—".

## Billing PRO con Mercado Pago

Suscripción mensual real a Resuelve PRO (`src/billing/`). **Mercado Pago es la fuente de verdad del cobro; Resuelve, de los entitlements derivados.** Nunca: redirect = pago, frontend = precio, body del webhook sin verificar = activar PRO.

### Arquitectura

- **Proveedor** (`billing-provider.ts`): contrato `BillingProvider` (crear, leer, buscar por `external_reference`, cambiar monto, cancelar, leer y listar cobros). `MercadoPagoBillingProvider` (fetch propio: timeout `MP_TIMEOUT_MS`, reintenta **solo GET**; POST/PUT nunca a ciegas) y `FakeBillingProvider` (tests, dev y Playwright; nunca cobra). `BILLING_PROVIDER=none|mercadopago|fake`.
- **Preapproval SIN plan**: cada suscripción tiene su monto (promo individual y cambio a precio normal sin tocar a nadie más). `POST /preapproval` con `reason`, `external_reference` (= `billing_subscriptions.id`, un UUID interno: nunca email/DNI/teléfono), `payer_email` (el de la cuenta; **no exige email verificado**), `auto_recurring { frequency: 1, frequency_type: months, transaction_amount, currency_id: ARS }`, `back_url` (`MP_BACK_URL`) y `status: pending`. Se manda `X-Idempotency-Key` = id interno (el SDK oficial lo manda en todo POST/PUT); igual la idempotencia es de Resuelve.
- **Entidades** (migración `BillingMercadoPago`):
  - `billing_subscriptions`: estado interno, `provider_status` crudo (solo diagnóstico), `checkout_url` (`init_point`), `base_amount`/`current_amount`/`currency`, `offer_code`/`offer_cycles`/`offer_redeemed_at`/`offer_regular_price_applied_at`, `return_path`, `authorized_at`, `past_due_since`, `cancelled_at`, `access_until`, `next_payment_at`, `last_payment_at`, `provider_updated_at` (`last_modified` aplicado), `last_provider_sync_at`. Unique (proveedor, id del preapproval) y **una sola suscripción abierta por profesional** (índice único parcial sobre PENDING/ACTIVE/PAST_DUE/PAUSED).
  - `billing_payments`: cobros recurrentes (authorized payments), unique por id del proveedor, sin datos de tarjeta.
  - `billing_webhook_events`: entregas procesadas (tópico, recurso, `x-request-id`, `ts`, resultado). Sin body ni firma.
  - `professional_profiles.billing_pro_until`: PRO derivado (lo lee todo el backend vía `effectivePlan`/`EFFECTIVE_PRO_SQL`).
- **Estados internos** (`billing-rules.ts`, única traducción del proveedor): `pending → PENDING`, `authorized → ACTIVE`, `paused → PAUSED`, `cancelled`/`canceled → CANCELLED`. `PAST_DUE` no sale del preapproval: lo ponen los cobros (rechazado / en reintento con la suscripción autorizada).
- **Acceso** (`subscriptionAccessUntil`): ACTIVE = próximo cobro + gracia; PAST_DUE = `past_due_since` + `BILLING_GRACE_DAYS`; CANCELLED = `access_until`; PENDING/PAUSED = nunca. El perfil guarda la mayor vigencia. Sin jobs para "vencer": se compara con `now()` al leer.

### Checkout

- `POST /api/v1/billing/pro/checkout` (auth + perfil profesional, throttle `THROTTLE_BILLING_LIMIT`, body opcional `{ returnTo }` solo ruta interna `/pro/...`) → `{ checkoutUrl, subscriptionId }`. El frontend navega **solo** al `init_point` devuelto; nunca arma URLs ni manda precios (un `amount` en el body da 400).
- Con el perfil bloqueado (`FOR UPDATE`): doble click → el segundo espera y recibe el MISMO checkout (e2e). PENDING vigente (`BILLING_PENDING_TTL_HOURS`) con el mismo precio → se reutiliza; vencido, con otro precio o PAUSED → se cierra también en Mercado Pago y se crea otro. ACTIVE/PAST_DUE → 409 `BILLING_ALREADY_SUBSCRIBED`. **PRO manual vigente → 409 `BILLING_MANUAL_PRO_ACTIVE`** (no se cobra algo que ya tiene; al vencer puede suscribirse).
- Timeout ambiguo al crear → se busca por `external_reference` antes de dar error; nunca se reintenta el POST. Error del proveedor → 502 `BILLING_PROVIDER_ERROR` ("No pudimos iniciar la suscripción. Intentá nuevamente.") y no queda nada a medias. Sin billing → 503 `BILLING_NOT_CONFIGURED`.
- `GET /api/v1/billing/pro/status` → `{ enabled, plan, source, entitlements, subscription | null, canCheckout, checkoutPrice | null, hadSubscription }`. Con un PENDING sin sincronizar hace 10 s, relee Mercado Pago (así la vuelta del checkout no depende solo del webhook).
- Vuelta: `MP_BACK_URL` → `/pro/plan/resultado`. **Volver no activa nada**: la página consulta el status.

### Webhooks

- `POST /api/v1/webhooks/mercado-pago/subscriptions` (sin JWT, sin throttle, fuera de Swagger), tópicos `subscription_preapproval` y `subscription_authorized_payment`.
- **Firma obligatoria**: `x-signature` (`ts=…,v1=…`) + `x-request-id`, validada con `WebhookSignatureValidator` del **SDK oficial** (`mercadopago`): HMAC-SHA256 de `id:<data.id>;request-id:<x-request-id>;ts:<ts>;` con `MP_WEBHOOK_SECRET` (`data.id` de la query, en minúsculas). Falla → **401** sin tocar nada.
- **Aviso ≠ dato**: se toma el id y se lee el estado ACTUAL (`GET /preapproval/{id}` o `GET /authorized_payments/{id}` + el preapproval). Lock perfil → suscripción, aplicar, derivar PRO.
- **Idempotencia y orden**: la misma entrega procesada no se repite (`DUPLICATE`); una lectura con `last_modified` anterior a la aplicada se descarta (nunca degrada); aplicar dos veces el mismo estado no cambia nada. Falla de reconciliación → 500 y Mercado Pago reintenta.
- Logs: "mp webhook received", "signature valid/invalid", tópico, recurso, "billing subscription reconciled …", "billing payment reconciled …". Nunca Access Token, secret, tarjeta ni body.

### Promo `PRO_FIRST_MONTH_20`

- Elegibilidad igual que siempre (`plans/pro-offers.ts`, backend decide). Elegible → preapproval a **$12.000**; si no, $15.000.
- **Se consume con el primer cobro promocional APROBADO** (`offer_redeemed_at`, `pro_offer_redemptions` unique, evento `REDEEMED`, `first_paid_pro_at`). Abandonar el checkout o un cobro rechazado no la gastan.
- Precio: `proMonthlyPrice(m, config)` (`plans/pro-offers.ts`, única fuente) = último cambio del panel admin (`pro_price_changes`) o, sin cambios, `PRO_MONTHLY_PRICE_ARS` (default **15000**); promo `PRO_INTRO_OFFER_DISCOUNT_PERCENT` = 20 sobre ese precio (hoy → **12000**). El checkout guarda `base_amount` por suscripción: un PENDING creado con otro precio base no se reutiliza (se cancela y se crea uno nuevo), así nunca sube a un precio viejo después de la promo.
- **Suscripciones creadas con el precio anterior** ($15.200 → $19.000): no se migran en silencio. En TEST: cancelar la vieja, crear otra y validar $12.000 → $15.000. En producción, si ya hubiera suscripciones pagas, cambiar su monto requiere una decisión explícita de negocio.
- Después de `PRO_INTRO_OFFER_CYCLES` cobros aprobados: `PUT /preapproval/{id}` con `auto_recurring.transaction_amount = 15000`, con lock (webhooks duplicados → un solo PUT) y verificando el monto informado. Recién entonces `offer_regular_price_applied_at`. Si falla (timeout), **no se marca**: queda para el job / `billing:reconcile -- list price`. Cancelar y volver → $15.000.

### Dunning (PAST_DUE)

- Cobro rechazado (o en `recycling`) con la suscripción autorizada → `PAST_DUE` desde el primer rechazo. PRO sigue `BILLING_GRACE_DAYS` (10, alineado a los reintentos de Mercado Pago); después, Free aunque el proveedor siga intentando. No se borra nada.
- Cobro aprobado después → `ACTIVE` y PRO de nuevo. Un rechazo de un ciclo ya cubierto por un pago posterior no cuenta. `paused` → PAUSED = Free.

### Cancelación

**Cancelar = cancelar la renovación**, nunca quitar lo ya pagado.

- `POST /api/v1/billing/pro/cancel` (throttle): primero **reconcilia** la suscripción y sus cobros contra Mercado Pago (trae el primer cobro aunque su aviso no haya llegado), relee el próximo cobro, calcula el fin del período pago, cancela en Mercado Pago (`PUT status=cancelled`) y **solo si el proveedor lo confirma** guarda `CANCELLED` + `access_until`. PRO hasta esa fecha (por fecha, sin esperar otro aviso); después Free. Cancelada desde Mercado Pago: mismo criterio.
- **Fin del período pago** (`paidThrough`, única fuente): el ciclo arranca en el último cobro aprobado o, si ese aviso todavía no llegó, en la autorización (un preapproval sin prueba gratis cobra el primer mes al autorizarse). Termina en el `next_payment_date` del proveedor, acotado a un ciclo. PENDING/PAUSED: sin período pago (`access_until = null`). PAST_DUE: solo el ciclo del último cobro aprobado, sin la gracia (normalmente ya vencido → Free).
- **Arrepentimiento** (`POST /api/v1/billing/pro/withdraw`, throttle; Ley 24.240 art. 34; migración `BillingWithdrawal`): derecho a revocar la contratación **`BILLING_WITHDRAWAL_DAYS` (10, mínimo legal) días corridos desde `authorized_at`** (`withdrawalDeadline`/`canWithdraw` en `billing-rules.ts`), sin motivo y aunque ya haya usado PRO. Es distinto de cancelar la renovación.
  - Orden: reconcilia (trae el cobro aunque su aviso no haya llegado) → lock perfil + suscripción → ¿dentro de la ventana? (si no, 409 `BILLING_WITHDRAWAL_EXPIRED` y no cambia nada) → cancela en Mercado Pago (si no lo confirma, 502 y no cambia nada) → `CANCELLED` + `withdrawn_at`, `access_until = null` y PRO fuera **en el acto** → recién ahí reembolsa.
  - **Reembolso** (`BillingReconciler.refundWithdrawn`): `POST /v1/payments/{id}/refunds` total, con `X-Idempotency-Key` por pago; marca `billing_payments.status = REFUNDED` + `refunded_at` solo si el proveedor lo confirma. Si falla, la revocación igual queda firme y el cobro sigue `APPROVED` sin `refunded_at` = **reembolso pendiente** (`refundPending` en `status`); lo reintentan el job de reconciliación, `billing:reconcile` o repetir el botón. Un cobro aprobado que llega **después** de revocar también se devuelve y nunca da acceso. Una lectura vieja que lo ve "aprobado" no pisa `REFUNDED`.
  - Repetir la llamada ya revocada no cancela ni devuelve de nuevo (idempotente). No toca un PRO manual. La promo ya usada no se libera (volver a PRO sale a $15.000).
  - `status.subscription` suma `withdrawableUntil` (null si ya no corresponde), `refundAmount`, `withdrawnAt` y `refundPending`; el frontend nunca calcula el plazo con su reloj.
- **Fuente de verdad**: `billing_subscriptions.access_until` es el dato; `professional_profiles.billing_pro_until` es su derivado (la mayor vigencia entre suscripciones) y es lo que leen `planSource`/`EFFECTIVE_PRO_SQL`. El aviso de cancelación, el job y `billing:reconcile` nunca pisan un `access_until` ya calculado; un cobro de antes de cancelar que llega tarde lo extiende hasta el fin de su ciclo.
- Un cobro aprobado **anterior** al rechazo no saca de la mora al releerse (solo uno posterior).
- Nunca se borran reseñas, analytics, agenda, perfil, servicios, matrículas ni presupuestos: solo cambian los entitlements.

### Reconciliación

- **Automática** (`BillingScheduler`): cada `BILLING_RECONCILE_INTERVAL_MINUTES` (60; 0 = apagada; nunca en tests) PENDING recientes, ACTIVE/PAST_DUE/PAUSED y cambios de precio pendientes, incluyendo los cobros que liste el proveedor.
- **Manual:** `npm run billing:reconcile -- list pending | past-due | price`, `-- reconcile <id>`, `-- reconcile-all` (`billing:reconcile:dev` desde el código). Contra base remota pide escribir `BILLING`; nunca imprime secrets.

### Test y producción

- Tests: siempre `FakeBillingProvider` (`test/billing.e2e-spec.ts`: checkout, doble click, reuso, timeout ambiguo, error, firma inválida, authorized, duplicado, fuera de orden, promo 12.000 → 15.000 una vez, reintento del PUT, mora/gracia/recuperación, pausa, arrepentimiento (dentro y fuera de la ventana, reembolso fallido y reintentado por el job, cobro tardío, cancelada dentro de la ventana, sin tocar PRO manual), cancelación con acceso —también sin el aviso del cobro, desde Mercado Pago, cobro tardío, PENDING, en mora, con PRO manual—, cupo y entitlements hasta `access_until`, convivencia con PRO manual). La validación de env **impide** `BILLING_PROVIDER=mercadopago` con `NODE_ENV=test`, `MP_ENV=prod` fuera de producción y `fake` en producción.
- Local/Playwright: `BILLING_PROVIDER=fake` sirve un checkout falso en `/api/v1/billing/fake-checkout/:id` (Autorizar / Tarjeta rechazada / Volver sin pagar) que simula el aviso y vuelve a `MP_BACK_URL`.
- **Prueba real con Mercado Pago (antes de producción)**: con credenciales y cuentas de prueba oficiales (`MP_ENV=test`, `MP_TEST_PAYER_EMAIL` = comprador de prueba), recorrer checkout real, `init_point`, retorno, ambos webhooks, primer cobro, cambio de monto y cancelación. Validar que `next_payment_date` sirva como fin de período; documentar diferencias acá.
- **Render (producción)**, después de desplegar (la migración corre con `migration:run:prod`):

```env
BILLING_PROVIDER=mercadopago
MP_ENV=prod
MP_ACCESS_TOKEN=<Access Token de producción>
MP_WEBHOOK_SECRET=<clave secreta de Webhooks>
MP_BACK_URL=https://resuelve.com.ar/pro/plan/resultado
PRO_MONTHLY_PRICE_ARS=15000
PRO_INTRO_OFFER_DISCOUNT_PERCENT=20
BILLING_GRACE_DAYS=10
BILLING_WITHDRAWAL_DAYS=10
```

- **Webhook en Mercado Pago**: Tus integraciones → aplicación de Resuelve → Webhooks → Configurar notificaciones → URL de producción `https://<backend-render>/api/v1/webhooks/mercado-pago/subscriptions` → eventos **Planes y suscripciones** (`subscription_preapproval`) y **pagos recurrentes** (`subscription_authorized_payment`) → Guardar → copiar la **clave secreta** a `MP_WEBHOOK_SECRET` en Render. Usar "Simular notificación" para ver el 200 en los logs ("mp webhook signature valid").
- **Diagnóstico de errores de Mercado Pago** (`mercado-pago-log.ts`): ante un 4xx/5xx el log de Render trae una línea `[MercadoPago] mp POST /preapproval → 400 error={status,message,error,cause:[{code,description}]} body={…} payload={reason,external_reference,payer_email,auto_recurring{frequency,frequency_type,transaction_amount,currency_id},back_url,status}`. Todo sanitizado: nunca Authorization/Access Token/secretos (también se buscan dentro del texto), claves de tarjeta, documento o teléfono tapadas, emails enmascarados (`ju***@gmail.com`, se ve el dominio) y dígitos largos ocultos. Al frontend sigue llegando el mensaje genérico.
- Sin `BILLING_PROVIDER` (o `none`) todo sigue como antes: `/plans` → `selfServe: false` y la página Plan ofrece "Quiero PRO" manual.
- Fuera de esta versión: facturas fiscales, cupones generales, anual, refunds, prorrateo y cambio de tarjeta dentro de Resuelve (se hace en Mercado Pago).


## PRO por transferencia

Segundo medio de pago de Resuelve PRO (`src/billing/transfer/`), para quien no usa Mercado Pago: **prepago por períodos, confirmado a mano por un admin, sin renovación automática.** Mismo precio (`proMonthlyPrice`) y misma oferta de bienvenida que Mercado Pago.

- **Fuente de PRO:** `professional_profiles.transfer_pro_until` = fin del último período `APPROVED` (lo escriben solo la confirmación y el arrepentimiento). `planSource` → `TRANSFER` (orden: MANUAL > BILLING > TRANSFER > BONUS), `EFFECTIVE_PRO_SQL` lo incluye, `entitlementSource` = `TRANSFER_PRO`. Referidos suman días después de `transfer_pro_until` (no se superponen).
- **Períodos y monto** (`transfer-rules.ts`, única fuente): 1, 3 o 6 meses de 30 días. Monto = precio vigente × meses; con la bienvenida elegible, el primer mes va con descuento (`transferAmount`: 12.000 + 15.000 × (meses − 1)). El frontend solo manda `months`. El monto queda fijo en el pedido aunque después cambie el precio.
- **Flujo del profesional** (`/billing/transfer`, `ProfessionalGuard`, mismo cuerpo de respuesta en todas): `GET` (datos bancarios, opciones, pedido en curso, último cerrado, `proUntil`, arrepentimiento, devolución pendiente) · `POST { months }` (crea el pedido `AWAITING_PROOF` con un código `RES-XXXXXX` sin caracteres ambiguos para el concepto; mismo período = mismo código; otro período lo reemplaza) · `DELETE /pending` (descartar antes de avisar) · `POST /proof/upload` (firma para el comprobante: mismo almacenamiento privado que las matrículas, carpeta `resuelve/transfer-proofs/<id>`, PDF/JPG/PNG/WebP ≤ 10 MB revalidado con el proveedor) · `POST /submit { proofPublicId? }` ("Ya transferí" → `IN_REVIEW`; el comprobante es opcional, el código alcanza) · `POST /withdraw { refundTo }`.
- **Un solo pedido abierto** (`AWAITING_PROOF`/`IN_REVIEW`) por profesional: índice único parcial. En revisión no se cambia el período ni se descarta (409 `TRANSFER_IN_REVIEW`).
- **Bloqueos** (`TRANSFER_BLOCKED`): suscripción de Mercado Pago `ACTIVE`/`PAST_DUE` (pagaría dos veces) o PRO manual sin vencimiento. Al revés, `POST /billing/pro/checkout` responde 409 `BILLING_TRANSFER_PRO_ACTIVE` mientras haya PRO por transferencia vigente.
- **Confirmar** (admin): con el perfil bloqueado, el período arranca en el máximo entre ahora y todo PRO vigente que vence (`transfer_pro_until`, `billing_pro_until` tras cancelar, `bonus_pro_until`, cortesía con vencimiento: `transferPeriodStart`), así nadie pierde días. Marca `first_paid_pro_at`, consume la oferta si el pedido la tenía (`pro_offer_redemptions`, unique), registra `PRO_PAYMENT_APPROVED` (+ `PRO_RENEWED` si ya había pagado antes, por cualquier medio) y avisa `PRO_TRANSFER_APPROVED`. Rechazar exige motivo (lo ve el profesional) y avisa `PRO_TRANSFER_REJECTED`; el plan no cambia. `GET /billing/transfer` trae `recentOutcome` (el último pago confirmado o rechazado) solo durante `TRANSFER_OUTCOME_VISIBLE_DAYS` (7) desde `reviewed_at` (`transferOutcomeVisible`, se deriva al consultar, sin cron); `last` sigue siendo el último pago cerrado.
- **Arrepentimiento (versión original, ver el punto de abajo para la política vigente):** `BILLING_WITHDRAWAL_DAYS` (10) desde la confirmación del **último** pago; pide alias o CBU/CVU válido (dígitos verificadores), lo pasa a `WITHDRAWN`, recalcula `transfer_pro_until` (quita solo esos días) y queda la devolución pendiente hasta que un admin la marca hecha. Fuera de plazo: 409 `TRANSFER_WITHDRAWAL_EXPIRED`.
- **Admin** (`AdminGuard`, 404 al resto; `/admin/pagos` en el frontend): `GET /admin/transfers?status=` (lista + `counts { inReview, awaitingProof, refundsPending }`), `GET /admin/transfers/:id` (con link firmado de 10 min al comprobante), `POST …/:id/approve { note? }`, `POST …/:id/reject { reason }`, `POST …/:id/refunded`, `POST /admin/users/:id/plan/transfer { months, amountArs, note? }` (**anotar un pago recibido por fuera**: queda `APPROVED` con `origin = ADMIN` y el monto que llegó; 409 si tiene un pedido abierto o paga con Mercado Pago), `GET/PUT /admin/transfer-account` (titular, alias, CBU/CVU con dígitos verificadores, banco, CUIT y `enabled`; historial en `transfer_accounts`, el último es el vigente). Sin datos cargados o con `enabled = false` la opción no aparece y `POST` responde 503 `TRANSFER_NOT_AVAILABLE`.
- **Job horario** (`TransferScheduler`, apagado en tests y con `TRANSFER_JOB_INTERVAL_MINUTES=0`): `PRO_TRANSFER_EXPIRING` una vez por fin de período, 3 días antes, si no sigue otro PRO pagado; y borra el archivo de los comprobantes revisados hace más de 90 días (`proof_deleted_at`; el registro queda). Nada vence por el job: el plan se deriva de la fecha al leer.
- **Avisos:** los tres tipos van a la sección `PLAN` (`/pro/plan#transferencia`), in-app, push y email, sin montos ni datos bancarios.
- **Baja de cuenta:** borra los comprobantes en Cloudinary junto con el resto de los archivos privados; el registro del pago se conserva.
- Tests: `test/transfer-payments.e2e-spec.ts` (períodos y promo, código, comprobante ajeno/formato, confirmar, renovar apilado, arrepentimiento y devolución, rechazo, anotar a mano, bloqueos, job) y `transfer-rules.spec.ts`.

## Baja de cuenta

`POST /api/v1/account/delete` `{ password }` (auth, throttle `THROTTLE_ACCOUNT_DELETE_LIMIT`, 5/min) y `GET /api/v1/account/deletion-check` (`{ canDelete, blockers[] }`). Módulo `src/account/` (reglas puras en `account-deletion.ts`; migración `AccountDeletion` → `users.deleted_at`).

- **Anonimiza, nunca borra la fila**: todas las claves hacia `users` son `ON DELETE CASCADE`, un `DELETE` se llevaría los trabajos, reseñas y solicitudes de otras personas. La cuenta pasa a "Usuario eliminado" (`eliminado-<id>@eliminado.invalid`, hash de contraseña inválido, sin teléfono, foto, zona ni `is_admin`), así que nadie vuelve a entrar y el email original queda libre para registrarse de nuevo.
- **Confirma con la contraseña**. Una incorrecta responde **403** `ACCOUNT_PASSWORD_INCORRECT` (nunca 401: el frontend cierra la sesión ante un 401 y acá la persona sigue autenticada).
- **Bloquea (409 `ACCOUNT_DELETE_BLOCKED`, `details.blockers`)** si hay un trabajo en curso como cliente o profesional (solicitud `PROFESSIONAL_SELECTED`/`SCHEDULED` o job `TO_COORDINATE`/`SCHEDULED`/`IN_PROGRESS`) o una suscripción PRO viva (`PENDING`/`ACTIVE`/`PAST_DUE`/`PAUSED`: se cancela antes en "Mi plan"; una cancelada con acceso restante no bloquea). Se revalida con los locks de la baja.
- **Cierra lo abierto**: solicitudes `DRAFT`/`WAITING_QUOTES`/`QUOTES_RECEIVED` pasan a `CANCELLED`; en todas sus solicitudes se borran dirección exacta, fotos y se reemplaza la descripción. Se borran sesiones, códigos de email, notificaciones, favoritos y el registro pendiente del email.
- **Profesional**: presupuestos `PENDING` → `WITHDRAWN` (no se pueden aceptar), invitaciones pendientes → `DECLINED`, perfil `PAUSED` sin `headline`/`bio`/foto, `slug` genérico (`profesional-eliminado-<id8>`, el anterior llevaba el nombre), fotos de trabajos y documentos de matrícula **borrados de Cloudinary** y número de matrícula limpiado.
- **Todo en una transacción**; los archivos se borran antes dentro de ella: si Cloudinary falla responde 502 `ACCOUNT_DELETE_FAILED` y no cambia nada (se puede reintentar). Repetir la baja con el access token todavía vigente (≤ 15 min) no falla.
- **Se conserva** (sin datos personales): trabajos, presupuestos y reseñas de la contraparte; el autor de una reseña figura como "Usuario". Mercado Pago conserva por su cuenta los datos de los cobros. Logs: solo cuenta de qué se hizo, sin email ni nombres.
- Tests: `test/account-deletion.e2e-spec.ts` (contraseña, anonimización y re-registro, solicitudes abiertas, bloqueos por trabajo y suscripción, perfil profesional, documentos, fallo de Cloudinary, historial de la contraparte, idempotencia).

## Seguridad

Ownership auditado (Fase 8): trabajos (`/pro/jobs/:id` y cada acción) filtran por el profesional dueño → otro profesional recibe 404 y un cliente 403; solicitudes y presupuestos filtran por el cliente; notificaciones por el usuario y el modo. Cubierto por `test/phase8-hardening.e2e-spec.ts` y las suites de cada fase. Las notas y el checklist del trabajo nunca viajan al cliente.

- Passwords con **Argon2id**. El login hace el mismo trabajo exista o no el email, para no revelar cuentas.
- Access token JWT corto (15 min por defecto). Refresh token JWT con `jti`, guardado **hasheado (SHA-256)**, rotado en cada uso. Si llega un refresh token ya usado, se revocan todas las sesiones del usuario.
- **Ventana de gracia de la rotación (`REFRESH_REUSE_GRACE_SECONDS`, default 10, rango 0–60).** Rotar marca el token anterior como revocado **y** enlazado a su reemplazo (`replaced_by_id`), en la misma transacción que emite el nuevo, con el token bloqueado (`FOR UPDATE`). Si el token rotado vuelve a llegar dentro de la ventana, es un reintento legítimo: una recarga cortó la respuesta y el navegador se quedó con el anterior, una pestaña duplicada o dos refresh simultáneos. Se emite un token hermano y el reemplazo anterior sigue valiendo, así que ninguna respuesta deja al cliente con un token muerto. Solo vale si la familia sigue viva: siguiendo los reemplazos se llega a un token vigente. Si en el camino hay un logout o una revocación por robo, el reintento responde 401. Fuera de la ventana, o si el token fue revocado por logout (revocado sin reemplazo), es reuso: se revocan todas las sesiones del usuario. Sin cambio de esquema.
- Guard global: todo es privado salvo lo marcado con `@Public()`. Los endpoints `/pro/*` exigen perfil profesional. Todas las operaciones verifican pertenencia: un recurso ajeno responde 404, sin revelar que existe.
- `ValidationPipe` con `whitelist` + `forbidNonWhitelisted`: cualquier campo no esperado (p. ej. `totalAmount`, `averageRating`, `status`) responde 400.
- Helmet (CSP estricta; relajada solo en `/api/docs`), CORS limitado a `FRONTEND_URL`, `trust proxy` para Render.
- Rate limiting por IP: global (`THROTTLE_LIMIT`, 120/min) y más estricto en login/registro (`THROTTLE_AUTH_LIMIT`), códigos, subidas, ubicación, billing y admin. Fase 8: las escrituras que llegan a otra persona (crear solicitud, presupuesto, reseña) tienen `THROTTLE_CREATE_LIMIT` (12/min) y el resto (invitar, cancelar, aceptar, favoritos, "Quiero PRO") `THROTTLE_WRITE_LIMIT` (30/min), definidos en `src/common/throttle.ts`. Los tests e2e los suben para no chocar entre sí.
- **Request id (Fase 8):** cada pedido tiene un id (el `X-Request-Id` del cliente si es seguro —`[\w.-]{8,64}`—, si no un UUID). Sale en el header `X-Request-Id`, en el cuerpo de todo error (`requestId`) y en cada línea de log del pedido. Es lo que un usuario le pasa a soporte; ver `docs/resuelve-pro-2-fase-8.md` → "Soporte".
- **Healthchecks (Fase 8):** `GET /api/v1/health` = readiness (API + base; 503 si la base no responde, es el que usa Render) y `GET /api/v1/health/live` = liveness (solo el proceso, sin base). Ninguno entra en los logs ni en el rate limit.
- Logs estructurados (pino, JSON en producción) con `authorization`, cookies, `password` y `refreshToken` censurados; los logs de requests no incluyen headers ni bodies.
- `passwordHash` tiene `select: false` y nunca pasa por los presenters.

### Decisión: tokens en el body, no en cookies

Frontend (Vercel) y API (Render) van a estar en dominios distintos. Las cookies de terceros (`SameSite=None`) son cada vez menos confiables en los navegadores, así que los tokens viajan en el body y en el header `Authorization`. El frontend guarda el access token solo en memoria y el refresh token en `localStorage` (compartido entre pestañas y persistente al cerrar la app; las pestañas rotan de a una con Web Locks). El objetivo final sigue siendo una cookie `HttpOnly + Secure` cuando ambos compartan dominio same-site (p. ej. `resuelve.com.ar` + `api.resuelve.com.ar`).

---

## Datos de QA antes de lanzar: `npm run launch:audit`

Solo lectura. Lista (con ids y emails enmascarados) perfiles y cuentas que parecen de QA (`TEST`, `prueba`, dominios `@test.dev`/`@resuelve.dev`), reseñas basura (`qwe…`, `123123…`), solicitudes de prueba, perfiles activos sin servicio publicable y la **oferta real por servicio** (no promocionar un servicio con 0 profesionales). No borra nada: lo que aparezca lo decide una persona (pausar el perfil desde la app o limpiar a mano con un backup previo). Correrlo contra producción desde el Shell de Render.

## Pasos futuros: Render

Nada de esto está hecho todavía. Requiere cuentas y acciones de ustedes.

1. **Crear la base**: Render → New → PostgreSQL (versión 16). Copiar la **Internal Database URL**.
2. **Crear el Web Service** desde este repo:
   - Root Directory: `backend`
   - Runtime: Node
   - Build Command: `npm ci && npm run build`
   - Pre-Deploy Command: `npm run migration:run:prod`
   - Start Command: `npm run start:prod`
   - Health Check Path: `/api/v1/health`
   - Si el plan de Render no tiene *Pre-Deploy Command* (instancias gratuitas), usar como Build Command: `npm ci && npm run build && npm run migration:run:prod`
3. **Variables de entorno** en el servicio:
   `NODE_ENV=production`, `DATABASE_URL` (la interna), `DATABASE_SSL=false` con la URL interna (`true` si usan la externa), `JWT_ACCESS_SECRET` y `JWT_REFRESH_SECRET` (generados, distintos), `FRONTEND_URL=https://resuelve.com.ar` (el primero es el origen que usa el billing si falta `MP_BACK_URL`; se puede sumar `https://resuelve-pearl.vercel.app`, separados por coma) y `MP_BACK_URL=https://resuelve.com.ar/pro/plan/resultado`. `PORT` lo pone Render.
4. **Primer deploy**: las migraciones corren en el pre-deploy. Después, desde el Shell del servicio, cargar el catálogo con `npm run seed:catalog` (seguro e idempotente) y el catálogo nacional de localidades con `npm run geo:import` (Georef, idempotente; `--dry-run` primero; ver `docs/multiciudad.md`). El seed de desarrollo **no** se corre en producción.
5. **Verificar**: `GET https://<servicio>.onrender.com/api/v1/health` → `{"status":"ok","database":"up"}` y la documentación en `/api/docs`.
6. **Frontend**: poner la URL en `src/environments/environment.ts` (`apiUrl: 'https://<servicio>.onrender.com/api/v1'`) y empezar a reemplazar los mocks usando `src/app/core/api/`.
# PRO 2.0 · Fase 3 (en QA)

`GET /pro/analytics/month` comparte los datos de Tu mes y el resumen del dashboard. `advanced` y `exposure` siguen sujetos a los entitlements PRO; Free y la prueba de primer éxito reciben solamente `basic`.

- **Valor:** suma `quotes.total_amount` de presupuestos aceptados durante el mes de Argentina, según `accepted_at`. Es valor presupuestado aceptado, no dinero cobrado. La equivalencia con el precio mensual vigente de PRO se muestra únicamente con valor positivo y precio configurado positivo; no se llama ROI financiero.
- **Respuesta:** oportunidades con `request_invitations.available_at` dentro del período y ya disponibles; se excluyen las canceladas o adjudicadas antes de esa hora. El numerador cuenta una vez el primer `quotes.created_at` del mismo profesional y solicitud, antes del fin del período. La mediana usa minutos desde `available_at`; un PATCH del quote no la cambia. La tasa es respuestas / oportunidades disponibles. El histórico anterior del mes en curso se corta al mismo día de mes. El esquema actual no conserva una fotografía completa de elegibilidad, cupo Free y capacidad de quotes en cada instante pasado; por eso estos casos aún requieren auditoría antes de declarar la tasa definitiva para QA.
- **Atribución:** solicitudes desde destacado solo cuando `attribution_source = PRO_FEATURED`, validado por el recorrido de eventos. El acceso anticipado PRO cuenta solo eventos nuevos `EARLY_OPPORTUNITY_DELIVERED` con `billingPlan=PRO` y `earlyAccess=true`. El historial anterior a esta marca no se reconstruye.
- **Referencias anónimas:** el servicio con más invitaciones propias en los últimos 90 días, en su ciudad principal (nunca mezcla localidades); otros profesionales activos del mismo servicio. Se devuelve `available=false` salvo al menos 8 profesionales, 8 que respondieron y 20 oportunidades, con umbrales configurables `PRO_BENCHMARK_MIN_PROFESSIONALS` y `PRO_BENCHMARK_MIN_EVENTS` (mínimos 8 y 20). Solo se entregan agregados; ningún ID ni dato individual de competidores. La referencia usa medianas por profesional, sin montos.

### Servicios más pedidos (`GET /services/popular`)

Público, devuelve `{ slugs: string[] }` (máx. 4) con los servicios con más pedidos enviados (no `DRAFT`) en los últimos 90 días. Sin cantidades ni datos de nadie, y sin guardar búsquedas ni textos. Solo hay ranking con volumen (≥ 20 pedidos en la ventana y ≥ 3 por servicio, `popular-services.ts`); si no, `[]`. Cache en memoria de 10 minutos. El inicio usa estos slugs para elegir los ejemplos de "Podés empezar por" (`homeExamples`, `REQUEST_EXAMPLE_BY_SERVICE`) y completa con la lista fija; si el pedido falla o no hay volumen, quedan los ejemplos fijos.

### Catálogo ampliado

Se sumaron: Limpieza de interior (Hogar y reparaciones), Desarrollador freelancer (Tecnología), Niñera (nueva categoría "Cuidado de personas") y, en "Trámites y profesionales", Contador/a, Abogado/a y Martillero/a (**`requiresLicense`**: matrícula por número, revisión manual como Gas y Electricidad, sin registro oficial definido todavía) y Gestor/a (sin matrícula). Resuelve no verifica antecedentes de las niñeras. En producción hay que correr `npm run seed:catalog` (idempotente) para que aparezcan.


### PRO Plus

La integración de tiers, suscripciones, transferencias, migración nueva y endpoints PDF/CSV se describe en [`docs/pro-plus.md`](../docs/pro-plus.md). No se modifica el importe de contratos vigentes para migrarlos de plan.

### Cambio programado PRO → PRO Plus

Pasar de PRO a PRO Plus **en el próximo período**, sin cancelar primero y sin perder días pagados. Solo ese sentido (Plus → PRO sigue siendo "cuando termine el período pago"). **Sin prorrateo**: nunca se cobra ni se regala parte de un período. Las reglas puras están en `plans/plan-change.ts`; los resolutores de plan (`effectivePlan`, `planSource`, `resolveProfessionalEntitlements`, `EFFECTIVE_PRO_SQL`) no cambian.

**Apagado por defecto.** Dos flags independientes (ninguna función de cobro nueva se activa sin decidirlo): `PLAN_CHANGE_TRANSFER_ENABLED` y `PLAN_CHANGE_MP_ENABLED`. Con ambos apagados todo se comporta como antes (los tests lo comprueban). `PLAN_CHANGE_MIN_HOURS_BEFORE_CHARGE` (24) es el margen mínimo antes del cobro de Mercado Pago.

**Precios**: siempre de las fuentes actuales (`proMonthlyPrice` / `proPlusMonthlyPrice`, panel admin o entorno); nada escrito a mano. En Mercado Pago el monto de Plus se congela al pedir el cambio (un cambio de precio posterior no lo mueve, igual que con las suscripciones existentes); la oferta de bienvenida es solo de PRO.

**Transferencia** (`billing/transfer/`):
- Con PRO por transferencia vigente se puede pedir Plus (1, 3 o 6 meses al precio vigente × meses). `request()` y `record()` relajan solo el bloqueo PRO → Plus.
- El período empieza al terminar el acceso pago vigente (`transferPeriodStart`, la misma regla de siempre). **Si el admin confirma después de esa fecha, empieza en la confirmación: no se descuentan días anteriores a la confirmación.**
- Cada opción trae `startsAt`/`endsAt`/`startsNow` (fecha prevista); `GET /billing/transfer` suma `currentTier`, `scheduledPlus` (el flag) y `plusStartsAt` (Plus confirmado que todavía no empezó). Sin el flag, `plusOptions` queda vacío cuando hay otro plan vigente.
- La confirmación de un Plus que empieza más adelante avisa `PRO_PLAN_CHANGE_SCHEDULED` (in-app) **en lugar de** `PRO_TRANSFER_APPROVED` (que además sale por email y push y diría "ya tenés PRO"). Cuando Plus empieza, el job horario (`tick`) crea `PRO_PLAN_CHANGE_ACTIVATED`: uno por pago (`dedupeKey`), solo al primer período Plus de una cadena (renovar Plus contiguo no es un cambio de plan) y solo si se confirmó antes de empezar.
- Rechazo o arrepentimiento: el PRO ya pagado queda intacto (`syncProfileAccess` recalcula; la devolución es solo la del pago de Plus).
- **Arrepentimiento** (política comercial aprobada el 17/10/2026 como beneficio contractual, sin concluir sobre el mínimo legal; `docs/plan-change/arrepentimiento-transferencia.md`): se puede pedir la devolución de **cada** pago desde su confirmación y hasta `BILLING_WITHDRAWAL_DAYS` (10) días corridos después del **inicio efectivo** del período pagado (`computeWithdrawalUntil` en `transfer-rules.ts`, única fuente; se guarda en `transfer_payments.withdrawal_until`, migración `TransferWithdrawalUntil`; un reajuste que adelanta el período nunca acorta lo ya informado: rige el mayor; los pagos anteriores sin la columna conservan 10 días desde la confirmación). La API devuelve ese vencimiento en `until` y el panel admin en `withdrawalUntil`. Se mide contra el momento de la **solicitud**. `POST /billing/transfer/withdraw { refundTo, paymentId? }` (sin `paymentId`, el último). Si no hay pagos posteriores se revoca en el acto, con devolución **total** a mano (sin descontar uso). Si los hay, se **registra** la solicitud (`withdrawal_requested_at`, migración `TransferWithdrawalRequest`; el pago sigue `APPROVED`, el acceso no cambia, repetirla = 409 `TRANSFER_WITHDRAWAL_PENDING`) y un admin la resuelve con `POST /admin/transfers/:id/withdrawal/resolve`: el pago pasa a `WITHDRAWN` con `withdrawn_at = withdrawal_requested_at` y los posteriores se adelantan (`retimeAfterRevocation`: misma duración, nunca se atrasan, ninguno se anula). `GET /billing/transfer` trae `withdrawals[]` (plan, `reference` = código de arrepentimiento, fechas, `periodState`, `deferred`, `requestedAt`) y mantiene `withdrawal` (el primero que todavía se puede iniciar). Cada ítem trae `canRequest`: una solicitud ya registrada (`requestedAt`) se sigue consultando hasta resolverla aunque la ventana venza (se pidió a tiempo); iniciar otra sobre ese pago = 409 `TRANSFER_WITHDRAWAL_PENDING`. Al resolver, `retimeAfterRevocation` solo adelanta períodos que **todavía no empezaron** (uno en curso o terminado no se mueve: sin reiniciar ni duplicar días) y se crea el aviso in-app `PRO_TRANSFER_WITHDRAWAL_RESOLVED` (migración `TransferWithdrawalResolvedNotice`; payload con el código y las fechas nuevas, si cambiaron; sin email ni push). Acceso público al trámite: `/arrepentimiento` (front). **Sin sesión** (`POST /withdrawal-requests`, público, `THROTTLE_WITHDRAWAL_REQUEST_LIMIT` 4/min, 3 por correo y día, tope diario `WITHDRAWAL_REQUESTS_DAILY_CAP`): guarda nombre, correo, teléfono y código/nota opcionales con la fecha del servidor y devuelve solo `{ code: 'ARR-XXXXXX', requestedAt }`; no consulta cuentas ni pagos ni cambia acceso. El admin verifica la identidad fuera del sistema y la vincula (`GET /admin/withdrawal-requests`, `POST …/:id/link { reference, refundTo }`, `…/dismiss`): el pago queda con `withdrawal_requested_at` = fecha original (409 `TRANSFER_WITHDRAWAL_EXPIRED` si ya excedía la ventana) y se resuelve con el flujo de siempre (migración `WithdrawalContactRequests`). Los pagos ya confirmados antes de este cambio siguen igual.

**Mercado Pago** (`billing.service.ts` + `billing-reconciler.service.ts`, `POST /billing/pro/plan-change` y `.../plan-change/cancel`): tres momentos que no se mezclan.
1. *Solicitado*: con lock se guarda la intención en `billing_subscriptions.pending_*` (monto de Plus congelado y monto anterior). Solo con suscripción ACTIVE de PRO por Mercado Pago, sin otro cambio pendiente, sin precio de bienvenida pendiente de pasar al normal y con el margen mínimo antes del próximo cobro. Un doble click devuelve el mismo estado.
2. *Confirmado por el proveedor*: `PUT /preapproval/{id}` con el monto nuevo (absoluto: repetirlo es seguro) y **lectura fresca** del preapproval; solo si informa el monto nuevo se marca (`pending_confirmed_at`) y se avisa `PRO_PLAN_CHANGE_SCHEDULED`. Un timeout nunca se da por hecho: se relee. Un rechazo 4xx deja todo como estaba (502). Sin confirmar, el job reintenta hasta `MAX_PLAN_CHANGE_ATTEMPTS` (5) y después descarta; si pierde el margen antes del cobro, también descarta.
3. *Activo*: `planTier` pasa a PRO_PLUS (con su monto y `plan_changed_at`) **solo cuando se aprueba un cobro con el monto de Plus** posterior al pedido (`chargeActivatesPlan`); se avisa `PRO_PLAN_CHANGE_ACTIVATED`. Un cobro con el monto anterior no activa nada; uno rechazado deja la mora de siempre con la gracia de PRO (nunca Plus). `current_amount` no se pisa mientras hay un cambio pendiente (hoy se cobra el de PRO). Si se aprueba un cobro con el monto de Plus mientras el cambio se está descartando, Plus se activa: lo que manda es lo efectivamente cobrado.
- Descartar: si el proveedor nunca recibió el pedido se limpia en el acto; si pudo recibirlo pasa a *descartando* (`pending_reverting_at`) y se vuelve al monto anterior con reintentos. Cancelar la renovación o revocar la contratación limpian el cambio. El precio normal posterior a la oferta de bienvenida (`applyRegularPrice`) se omite mientras hay un cambio pendiente (nunca pisa su monto).
- `GET /billing/pro/status` suma `subscription.planChange` y `planChangeOptions` (`null` = no se ofrece).

**Avisos**: `PRO_PLAN_CHANGE_SCHEDULED` / `PRO_PLAN_CHANGE_ACTIVATED`, solo in-app (no están en `EMAIL_NOTICE_COPY` ni en `PUSH_COPY`), sin montos en el payload.

**Qué está comprobado y qué no (Mercado Pago)**: la documentación oficial indica que el monto de un preapproval se cambia con `PUT /preapproval/{id}` (`auto_recurring.transaction_amount`), pero **no dice** si ese cambio genera un cobro inmediato, desde qué ciclo rige ni si exige reautorizar, y el prorrateo documentado es de los planes (`preapproval_plan`), no de las suscripciones sin plan. **No se pudo probar en el sandbox de Mercado Pago** (sin credenciales de prueba ni salida de red a su API desde donde se desarrolló). Por eso `PLAN_CHANGE_MP_ENABLED` queda apagado y la pantalla habla de "próximo cobro previsto", nunca de garantía. Antes de activarlo hay que comprobar en el sandbox, con una suscripción de prueba: (a) que el `PUT` no cobra en el momento, (b) que el próximo cobro sale con el monto nuevo y no con el anterior, (c) que no pide reautorizar, y (d) qué pasa con un `PUT` justo antes del cobro (para validar o ajustar el margen de 24 h). Todo lo demás (estados, reintentos, fallos) se probó con el proveedor falso (`FakeBillingProvider`: timeout sin aplicar, timeout aplicado, rechazo 4xx).

**Cobro de Plus que llega con el cambio ya cerrado — sin resolver, bloquea habilitar Mercado Pago.** Cancelar la *renovación* (`POST /billing/pro/cancel`) y descartar *solo el cambio* (`.../plan-change/cancel`) son cosas distintas: la primera da de baja la suscripción (y descarta el cambio); la segunda deja la suscripción viva con el monto anterior. En ambos casos puede entrar igual un cobro con el monto de Plus (uno ya en curso en el proveedor, o que cruzó con el pedido de cancelar). Qué hace hoy el sistema, cubierto por `plan-change.e2e-spec.ts`:

| Caso | Monto cobrado | Acceso otorgado | Tratamiento del cobro |
|---|---|---|---|
| Cobro de Plus **posterior** a cancelar la renovación | Se registra tal cual (`billing_payments`, APPROVED, monto de Plus) | Ninguno nuevo; nunca Plus; `access_until` no cambia | Sin devolución automática ni decisión tomada. Queda un `warn` en el log ("cobro aprobado a revisar", con id de suscripción y de pago, sin datos personales) |
| Cobro de Plus **ya en curso antes** de cancelar | Se registra tal cual | PRO (no Plus) hasta el fin de ese ciclo | Sin decisión: se cobró el monto de Plus y se da PRO |
| Se descartó solo el cambio y entra un cobro de Plus | Se registra tal cual | Sigue PRO con el monto anterior en la suscripción | Sin decisión; mismo `warn` |
| Cobro de Plus mientras el cambio se está descartando (*descartando*) | Se registra | **Plus se activa** (manda lo efectivamente cobrado) | Es la regla vigente; pendiente de confirmar |

Que Plus no se active **no resuelve** el caso: queda dinero cobrado de más (o acceso menor al pagado) sin política. No se inventó una devolución ni una regla de acceso. **Decisión comercial pendiente** (ver `docs/plan-change/terminos-propuesta.md`, punto D): si ese cobro se devuelve, si se acredita contra el próximo período o si se otorga Plus por el período cobrado. Hasta decidirlo, `PLAN_CHANGE_MP_ENABLED` no se enciende. Para encontrarlos: pagos APPROVED cuyo monto supera el `current_amount` de su suscripción o que son posteriores a `cancelled_at`.

**Antes de habilitar Mercado Pago, además de las pruebas de sandbox:** el comportamiento que se busca (programar Plus para el próximo período, sin cobro inmediato ni pérdida de días de PRO, y "Hoy no se cobra nada" en la pantalla) **depende de que el proveedor lo respete y todavía no está validado**. Si Mercado Pago cobra en el momento, aplica el monto en otro ciclo o pide reautorizar, hay que ajustar la implementación (y los textos) antes de activarlo.

**Fuera de esta entrega** (a decidir antes de habilitar): el arrepentimiento y las devoluciones **no se modificaron**. Puntos que conviene resolver: (1) en transferencia, la ventana va desde la confirmación hasta 10 días después del inicio efectivo del período (política aprobada, ver arriba); (2) en Mercado Pago, la ventana sigue contando desde la autorización original y no se reabre con el cambio, y revocar devuelve todos los cobros aprobados dentro de la ventana; (3) los Términos (`#pro-pagos`) no describen todavía el cambio de plan.

Migración nueva `1796100000000-ScheduledPlanChange` (columnas `pending_*` y `plan_changed_at` de `billing_subscriptions`, restricción de consistencia y dos valores de `notification_type`). Probada apply → revert → apply.
