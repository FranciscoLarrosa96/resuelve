# Resuelve API

Backend MVP de Resuelve: NestJS + TypeScript + PostgreSQL (TypeORM, migraciones reales), REST bajo `/api/v1`, documentación OpenAPI en `/api/docs`.

El frontend Angular vive en la raíz del repo y **todavía usa datos mock**; este backend está aislado y listo para conectarse en la próxima fase.

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
| `FRONTEND_URL` | no | Orígenes permitidos por CORS, separados por coma |
| `LOG_LEVEL` | no | `info` por defecto |
| `THROTTLE_LIMIT` | no | Pedidos por minuto y por IP (global). Default `120` |
| `THROTTLE_AUTH_LIMIT` | no | Límite de `/auth/login` y `/auth/register` por minuto e IP. Default `10` |
| `TEST_DATABASE_URL` | solo tests | Base **descartable** para los tests e2e (se borra en cada corrida) |

Generar un secreto:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

La app valida la configuración al arrancar: si falta algo, no levanta y dice qué falta.

## Conectar PostgreSQL local

Con Docker:

```bash
docker run --name resuelve-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=resuelve_dev -p 5432:5432 -d postgres:16
# .env
DATABASE_URL=postgres://postgres:postgres@localhost:5432/resuelve_dev
```

O cualquier PostgreSQL 13+ instalado localmente.

## Desarrollo

```bash
npm run migration:run   # crea el esquema
npm run seed            # datos de prueba
npm run start:dev       # http://localhost:3000/api/v1 · docs en http://localhost:3000/api/docs
```

Cuentas del seed (contraseña `resuelve-dev-2026`):

- Cliente: `maria@resuelve.dev` (tiene solicitudes en distintos estados)
- Profesionales: `juan@resuelve.dev`, `carlos@resuelve.dev`, `martin@resuelve.dev`, `hernan@resuelve.dev`, …

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

## Seed

```bash
npm run seed                   # carga datos si la base está vacía
SEED_RESET=true npm run seed   # vacía todas las tablas y recarga
```

Crea Tandil y sus barrios, 4 categorías, 13 servicios, la clienta María, 13 profesionales (con servicios, zonas, verificaciones y portfolio) y solicitudes en curso. Las métricas (rating, reseñas, trabajos) **no se inventan**: el seed crea trabajos cerrados con reseñas reales y las métricas se calculan a partir de esas filas, igual que en producción. Las fotos son URLs mock (`picsum.photos`); no depende de randomuser. Se niega a correr con `NODE_ENV=production`.

## Tests

```bash
npm test             # unit + e2e
npm run test:unit    # reglas puras, sin base de datos
npm run test:e2e     # API completa contra PostgreSQL real (requiere TEST_DATABASE_URL)
```

Los e2e borran y recrean el esquema de `TEST_DATABASE_URL`, corren las migraciones reales y el seed. Sin esa variable, se saltean (no simulan una base).

Qué cubren:

| Área | Casos |
|---|---|
| Auth | registro, login, password incorrecta (mismo error que email inexistente), email duplicado sin importar mayúsculas, rotación de refresh token, detección de reuso, logout, tokens hasheados |
| Solicitudes | el cliente solo ve y edita las suyas; máximo 3 invitados; elegibilidad (servicio, urgencias) |
| Presupuestos | solo cotiza quien fue invitado; no dos activos del mismo profesional; totales calculados en el servidor; edición |
| Aceptar | solo el dueño; una sola quote gana; aceptaciones concurrentes (solo una gana) |
| Reseñas | solo trabajo completo, solo el cliente real, una por trabajo, recálculo de rating |
| Privacidad | el invitado no ve dirección ni teléfono; el elegido sí (y solo mientras el trabajo está activo) |
| Estados | transiciones imposibles rechazadas (unit + e2e) |
| Perfil pro | no acepta métricas del cliente; nadie se verifica a sí mismo |

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
  database/        opciones de TypeORM, data source del CLI, naming snake_case, migraciones, seed
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
                                  ─1:N─ PortfolioItem
City ─1:N─ Zone          Category ─1:N─ Service
User(cliente) ─1:N─ ServiceRequest ─1:N─ RequestPhoto
                                   ─1:N─ RequestInvitation (máx. 3) ─ ProfessionalProfile
                                   ─1:N─ Quote ─1:N─ QuoteItem
                                   ─1:0..1─ Appointment
                                   ─1:0..1─ Review
User ─1:N─ RefreshToken (hash SHA-256, rotación)
```

- **Una sola cuenta** por persona: el `User` es cliente y, opcionalmente, tiene un `ProfessionalProfile` ("Modo profesional"). No hay roles excluyentes.
- **Servicios en la base**, no en enums.
- **Geografía simple**: `City` (con provincia como texto) y `Zone`. Sumar Azul u Olavarría es cargar filas.
- **Dinero** en `numeric(12,2)`. Se lee como string (nunca float), se calcula en centavos enteros y la API lo devuelve como `"52000.00"`.
- Todos los `id` son UUID; las fechas, `timestamptz`.

### Estados de una solicitud

```text
DRAFT → WAITING_QUOTES → QUOTES_RECEIVED → PROFESSIONAL_SELECTED → SCHEDULED → AWAITING_REVIEW → CLOSED
                         (vuelve a WAITING_QUOTES      └─────────────(sin turno)──────┘
                          si se retira la única quote)
Cualquier estado previo al trabajo terminado → CANCELLED
```

| Backend | Frontend ("Mis solicitudes") |
|---|---|
| `WAITING_QUOTES` | 0 · Esperando respuestas |
| `QUOTES_RECEIVED` | 1 · Presupuestos recibidos |
| `PROFESSIONAL_SELECTED` | 2 · Profesional seleccionado |
| `SCHEDULED` | 3 · Trabajo programado |
| `AWAITING_REVIEW` | 4 · Pendiente de reseña |
| `CLOSED` | 5 · Cerrado |

Cualquier transición fuera de la tabla responde `409 INVALID_REQUEST_STATE`.

Urgencia: `FLEXIBLE` ("Puede esperar"), `TODAY` ("Para hoy"), `URGENT`. Una urgencia es una solicitud más; la regla extra es que solo se puede invitar a profesionales con "Disponible hoy".

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
| GET | `/cities` 🔓 · `/zones` 🔓 | `?city=tandil` |
| GET | `/professionals` 🔓 | `?service&zone&availableToday&licenseVerified&minRating&page&pageSize` (service/zone aceptan id o slug) |
| GET | `/professionals/:id` 🔓 | Ficha pública + portfolio + reseñas + distribución de estrellas |
| POST | `/requests` | Crea en `DRAFT` |
| GET | `/requests/mine` | Paginado, `?status=` |
| GET · PATCH | `/requests/:id` | Solo el dueño |
| POST | `/requests/:id/cancel` | |
| POST | `/requests/:id/invitations` | `{ professionalIds }`, máximo 3 en total |
| GET | `/requests/:id/quotes` | Presupuestos recibidos |
| POST | `/quotes/:id/accept` | Transaccional |
| POST | `/requests/:id/appointment` | Confirma el turno → `SCHEDULED` |
| POST | `/requests/:id/review` | `{ rating 1–5, comment? }` |
| POST | `/pro/profile` | Activa el modo profesional |
| GET | `/pro/me` 🛠 | Perfil propio, plan y uso del mes |
| PATCH | `/pro/profile` 🛠 | Titular, bio, experiencia, servicios, zonas |
| PATCH | `/pro/availability` 🛠 | "Disponible hoy" (vence a medianoche, hora de Argentina) |
| POST | `/pro/verifications` 🛠 | Pide una verificación (queda `PENDING`) |
| GET | `/pro/requests` 🛠 | Solicitudes recibidas, `?status=PENDING\|QUOTED\|SELECTED…` |
| GET | `/pro/requests/:id` 🛠 | |
| POST | `/pro/requests/:id/decline` 🛠 | |
| POST | `/pro/requests/:id/quote` 🛠 | Crea el presupuesto |
| PATCH | `/pro/quotes/:id` 🛠 | Edita el presupuesto pendiente |
| POST | `/pro/quotes/:id/withdraw` 🛠 | |
| POST | `/pro/requests/:id/complete` 🛠 | Solo el profesional elegido → `AWAITING_REVIEW` |
| GET | `/pro/appointments` 🛠 | `?from&to` (máx. 62 días) |

### Errores

Todas las respuestas de error tienen el mismo formato:

```json
{ "statusCode": 409, "code": "INVALID_REQUEST_STATE", "message": "No se puede pasar una solicitud de WAITING_QUOTES a AWAITING_REVIEW", "details": { "from": "WAITING_QUOTES", "to": "AWAITING_REVIEW" }, "path": "/api/v1/…", "timestamp": "…" }
```

El frontend debe decidir por `code` (lista en `src/common/errors/error-codes.ts`), no por `message`. Los errores 5xx nunca exponen stack traces ni SQL.

## Reglas de negocio implementadas en el servidor

- **Privacidad de la dirección** (`requests/request.presenter.ts`): un profesional invitado ve barrio, descripción y fotos, y del cliente solo nombre + inicial. Dirección exacta, nombre completo y teléfono se comparten **solo** con el profesional elegido y **solo** mientras el trabajo está activo (`PROFESSIONAL_SELECTED`, `SCHEDULED`, `AWAITING_REVIEW`). Lo mismo aplica en la agenda.
- **Invitaciones**: máximo 3 por solicitud (validado en DTO y en servicio con lock de fila); el profesional tiene que ofrecer el servicio; nadie se invita a sí mismo; en urgencias, solo profesionales disponibles hoy.
- **Presupuestos**: solo quien fue invitado; uno activo por profesional y solicitud (regla + índice único parcial); se edita el existente; `totalAmount` lo calcula el servidor (si los envía el cliente → 400). Con ítems, materiales = suma de ítems.
- **Aceptar presupuesto** (transacción + `SELECT … FOR UPDATE`): valida dueño, estado y vigencia; la quote pasa a `ACCEPTED`, las demás a `REJECTED`; invitaciones `SELECTED`/`NOT_SELECTED`; la solicitud registra al profesional elegido. Dos aceptaciones simultáneas: solo una gana (hay un test que lo prueba).
- **Reseñas**: solo el cliente dueño, solo con el trabajo terminado y un profesional contratado, una por trabajo (regla + índice único). Cierra la solicitud y recalcula el rating en la misma transacción.
- **Métricas**: `averageRating`, `reviewsCount` y `completedJobsCount` se calculan desde las tablas (`professional-metrics.ts`); ningún endpoint las acepta.
- **Verificaciones**: el profesional puede *pedirlas* (quedan `PENDING`); aprobarlas requiere un revisor. El modelo lo soporta; el panel admin no existe todavía.
- **Plan FREE/PRO**: modelado con `planTier` y uso mensual. En FREE se pueden responder 10 solicitudes por mes (`PLAN_LIMIT_REACHED`). El contador se reinicia solo al cambiar de mes. Sin pagos: el plan se cambia desde la base o el seed.

## Seguridad

- Passwords con **Argon2id**. El login hace el mismo trabajo exista o no el email, para no revelar cuentas.
- Access token JWT corto (15 min por defecto). Refresh token JWT con `jti`, guardado **hasheado (SHA-256)**, rotado en cada uso. Si llega un refresh token ya usado, se revocan todas las sesiones del usuario.
- Guard global: todo es privado salvo lo marcado con `@Public()`. Los endpoints `/pro/*` exigen perfil profesional. Todas las operaciones verifican pertenencia: un recurso ajeno responde 404, sin revelar que existe.
- `ValidationPipe` con `whitelist` + `forbidNonWhitelisted`: cualquier campo no esperado (p. ej. `totalAmount`, `averageRating`, `status`) responde 400.
- Helmet (CSP estricta; relajada solo en `/api/docs`), CORS limitado a `FRONTEND_URL`, `trust proxy` para Render.
- Rate limiting global (`THROTTLE_LIMIT`) y más estricto en login/registro.
- Logs estructurados (pino, JSON en producción) con `authorization`, cookies, `password` y `refreshToken` censurados; los logs de requests no incluyen headers ni bodies.
- `passwordHash` tiene `select: false` y nunca pasa por los presenters.

### Decisión: tokens en el body, no en cookies

Frontend (Vercel) y API (Render) van a estar en dominios distintos. Las cookies de terceros (`SameSite=None`) son cada vez menos confiables en los navegadores, así que los tokens viajan en el body y en el header `Authorization`. Recomendación para el frontend: access token en memoria y refresh token en `localStorage` (o migrar a cookie `httpOnly` si en el futuro ambos comparten dominio, p. ej. `api.resuelve.com.ar`).

---

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
   `NODE_ENV=production`, `DATABASE_URL` (la interna), `DATABASE_SSL=false` con la URL interna (`true` si usan la externa), `JWT_ACCESS_SECRET` y `JWT_REFRESH_SECRET` (generados, distintos), `FRONTEND_URL=https://resuelve-pearl.vercel.app` (y el dominio definitivo, separados por coma). `PORT` lo pone Render.
4. **Primer deploy**: las migraciones corren en el pre-deploy. El seed de desarrollo **no** se corre en producción.
5. **Verificar**: `GET https://<servicio>.onrender.com/api/v1/health` → `{"status":"ok","database":"up"}` y la documentación en `/api/docs`.
6. **Frontend**: poner la URL en `src/environments/environment.ts` (`apiUrl: 'https://<servicio>.onrender.com/api/v1'`) y empezar a reemplazar los mocks usando `src/app/core/api/`.
