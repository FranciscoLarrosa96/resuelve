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
| `FRONTEND_URL` | no | Orígenes permitidos por CORS, separados por coma |
| `LOG_LEVEL` | no | `info` por defecto |
| `THROTTLE_LIMIT` | no | Pedidos por minuto y por IP (global). Default `120` |
| `THROTTLE_AUTH_LIMIT` | no | Límite de `/auth/login` y `/auth/register` por minuto e IP. Default `10` |
| `THROTTLE_VERIFICATION_LIMIT` | no | Firmas de subida y envíos de matrícula por minuto e IP. Default `10` |
| `CLOUDINARY_CLOUD_NAME` · `CLOUDINARY_API_KEY` · `CLOUDINARY_API_SECRET` | no | Almacenamiento **privado** del documento opcional de matrícula. Sin las tres, solo se puede enviar el número (la subida responde `503 UPLOADS_NOT_CONFIGURED`). El secret nunca sale del backend |
| `CLOUDINARY_API_BASE` | no | Solo pruebas locales contra un doble del proveedor. En producción, vacía |
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
3. `POST /api/v1/pro/profile` con Bearer token publica el perfil. Requiere `headline` con texto, `yearsExperience` (0–70), al menos un `serviceId` y cobertura: `coversEntireCity: true` (todo Tandil) o al menos un `zoneId` válido. Acepta `bio` y `availableToday` opcionales. Perfil, asociaciones y disponibilidad se guardan en una transacción.
4. `GET /api/v1/auth/me` devuelve el nuevo `professionalProfileId`; `GET /api/v1/pro/me` devuelve servicios, zonas, disponibilidad y solicitudes de verificación propias. `GET /api/v1/professionals/:id` y la búsqueda pública muestran el perfil inmediatamente.

Solo puede existir un perfil por usuario. Una segunda alta responde `409 PROFESSIONAL_PROFILE_EXISTS`; el cliente debe abrir el panel o usar `PATCH /api/v1/pro/profile` para editar. `PATCH /api/v1/pro/availability` permite renovar “Disponible hoy”, que vence a medianoche en Argentina. No hay estado de borrador o publicación: el `POST` publica directamente. `requiresLicense` indica que el servicio requiere matrícula: el perfil se publica igual, pero ese servicio no aparece en búsquedas ni en la ficha pública hasta que su matrícula `LICENSE` esté aprobada y vigente (ver "Núcleo profesional").

## Profesionales de prueba: `npm run fixture:test-pros`

Para validar la integración con datos reales sin el seed de desarrollo. `create` usa solo la API pública, igual que una persona: `POST /auth/register` (o `/auth/login` si ya existe), `POST /pro/profile` y `PATCH /pro/availability`. No escribe SQL, así que no inventa métricas, verificaciones, reseñas ni portfolio. Crea como máximo 2 perfiles, claramente de prueba: "Profesional de prueba 1/2", con emails `@resuelve.test` (dominio reservado) y sin teléfono.

```bash
npm run build
TEST_PRO_PASSWORD='una-clave-larga' npm run fixture:test-pros -- create --api <API>/api/v1 [--count 2]
npm run fixture:test-pros -- remove   # usa DATABASE_URL; borra solo esas cuentas (cascada)
```

`create` es idempotente: correrlo de nuevo actualiza los perfiles y renueva "Disponible hoy", que vence a medianoche. La contraseña no se guarda en ningún lado.

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
| Auth | registro, login, password incorrecta (mismo error que email inexistente), email duplicado sin importar mayúsculas, rotación de refresh token, detección de reuso, logout, tokens hasheados |
| Solicitudes | el cliente solo ve y edita las suyas; máximo 3 invitados; elegibilidad (servicio, urgencias) |
| Presupuestos | solo cotiza quien fue invitado; no dos activos del mismo profesional; totales calculados en el servidor; edición |
| Aceptar | solo el dueño; una sola quote gana; aceptaciones concurrentes (solo una gana) |
| Reseñas | solo trabajo completo, solo el cliente real, una por trabajo, recálculo de rating |
| Privacidad | el invitado no ve dirección ni teléfono; el elegido sí (y solo mientras el trabajo está activo) |
| Estados | transiciones imposibles rechazadas (unit + e2e) |
| Perfil pro | no acepta métricas del cliente; nadie se verifica a sí mismo |
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
| GET | `/pro/me` 🛠 | Perfil propio: estado, servicios con estado de matrícula, zonas guardadas, verificaciones (sin documento ni revisor) |
| PATCH | `/pro/profile` 🛠 | Titular, bio, experiencia, servicios, `coversEntireCity`, zonas |
| PATCH | `/pro/status` 🛠 | `{ status: ACTIVE \| PAUSED }` — pausar/reactivar el perfil |
| PATCH | `/pro/availability` 🛠 | "Disponible hoy" (vence a medianoche, hora de Argentina) |
| POST | `/pro/verifications/upload` 🛠 | Firma temporal para subir el documento de una matrícula al almacenamiento privado |
| POST | `/pro/verifications` 🛠 | Envía (o reenvía) una verificación con `documentPublicId`; queda `PENDING` |
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
- **Invitaciones**: máximo 3 por solicitud (validado en DTO y en servicio con lock de fila); el profesional tiene que estar activo (no pausado) y poder ofrecer el servicio (si requiere matrícula, aprobada y vigente); nadie se invita a sí mismo; en urgencias, solo profesionales disponibles hoy. La zona no se valida al invitar (deuda: hoy solo filtra la búsqueda).
- **Presupuestos**: solo quien fue invitado; uno activo por profesional y solicitud (regla + índice único parcial); se edita el existente; `totalAmount` lo calcula el servidor (si los envía el cliente → 400). Con ítems, materiales = suma de ítems.
- **Aceptar presupuesto** (transacción + `SELECT … FOR UPDATE`): valida dueño, estado y vigencia; la quote pasa a `ACCEPTED`, las demás a `REJECTED`; invitaciones `SELECTED`/`NOT_SELECTED`; la solicitud registra al profesional elegido. Dos aceptaciones simultáneas: solo una gana (hay un test que lo prueba).
- **Reseñas**: solo el cliente dueño, solo con el trabajo terminado y un profesional contratado, una por trabajo (regla + índice único). Cierra la solicitud y recalcula el rating en la misma transacción.
- **Métricas**: `averageRating`, `reviewsCount` y `completedJobsCount` se calculan desde las tablas (`professional-metrics.ts`); ningún endpoint las acepta.
- **Verificaciones**: el profesional las envía (quedan `PENDING`); solo un revisor las aprueba o rechaza con `npm run verification:review` (sin endpoint HTTP). Ver "Núcleo profesional".
- **Plan FREE/PRO**: modelado con `planTier` y uso mensual. En FREE se pueden responder 10 solicitudes por mes (`PLAN_LIMIT_REACHED`). El contador se reinicia solo al cambiar de mes. Sin pagos: el plan se cambia desde la base o el seed.

## Núcleo profesional: cobertura, perfil y matrícula

Las reglas viven en `src/professionals/professional-rules.ts` (una sola fuente para ficha pública, búsqueda e invitaciones).

**Cobertura.** "Todo Tandil" **no es una zona**: es `coversEntireCity` en el perfil. Con `true`, el profesional aparece en la búsqueda de cualquier zona activa; con `false`, se usan sus zonas (`professional_service_areas`). Al pasar a "Todo Tandil" las zonas guardadas se conservan (y se ignoran), así al volver a "Solo algunos barrios" se recuperan. Una zona desactivada (`active = false`) deja de matchear para todos. No existe texto libre como zona ("Otro barrio"): un barrio nuevo se suma al catálogo.

**Estado del perfil** (decidido por el backend):

| Estado | Cómo | Efecto |
|---|---|---|
| Público | `status = ACTIVE` | Búsquedas, ficha e invitaciones. Sin servicios habilitados, igual se ve en búsquedas sin filtro de servicio |
| Oculto | `status = PAUSED` (`PATCH /pro/status`) | Fuera de búsquedas, ficha `404` e invitaciones nuevas `422`. No toca historial ni "Disponible hoy" |
| Inactivo / suspendido | — | No modelado: no hay moderación de perfiles todavía |

**Matrícula por servicio** (`service.requiresLicense`, nunca por nombre):

| Estado (lo ve el profesional) | Significa | Público |
|---|---|---|
| `NOT_SUBMITTED` | No hay envío (no es una fila) | El servicio no se publica |
| `PENDING` | Enviada, en revisión | No se publica |
| `VERIFIED` | Aprobada y vigente | Se publica; `verifications.licenses` muestra `{ serviceId, reference }` |
| `REJECTED` | Rechazada con motivo legible (`rejectionReason`) | No se publica; se puede reenviar |
| `EXPIRED` | Aprobada con `expiresAt` vencido: deja de contar en el acto; se persiste al reenviar | No se publica |

- Cada envío es una fila nueva: rechazadas y vencidas quedan como historial. Un índice único parcial impide dos activas (`PENDING`/`VERIFIED`) por profesional, tipo y servicio.
- `?licenseVerified=true` significa "matrícula aprobada y vigente de un servicio que ofrece"; con `service`, **de ese servicio**.
- Lo público nunca incluye pendientes, rechazos, motivo, revisor, documento ni `publicId`. `/pro/me` tampoco trae el documento (solo `hasDocument`).
- Quitar un servicio solo lo saca de búsquedas: solicitudes, presupuestos y verificaciones anteriores no se tocan.

**Qué se verifica: el número.** El profesional carga el número (o referencia) de matrícula; el revisor lo busca en el **registro oficial** del servicio y confirma que esté vigente y a nombre de ese profesional (el nombre de la cuenta). Para Gas, los gasistas matriculados figuran en la distribuidora de la zona (en Tandil, Camuzzi). Para Electricidad hay que confirmar qué registro corresponde antes de aprobar. Escribir el número no verifica nada: siempre decide un revisor.

**Documento de respaldo (opcional, upload privado).** Sirve cuando el número no aparece claro en el registro. Sin documento el envío funciona igual, también sin Cloudinary configurado. Proveedor: Cloudinary, recursos `type=private` (no hay URL pública).

1. `POST /pro/verifications/upload { serviceId }` → firma temporal que fija `public_id` (`resuelve/verifications/<professionalProfileId>/<uuid>`, sin email/DNI/teléfono), tipo privado y formatos (`pdf, jpg, png, webp`). Límite: 10 MB. Rate limit por minuto.
2. El navegador sube el archivo **directo** a Cloudinary (no pasa por Render ni por Postgres).
3. `POST /pro/verifications { type: LICENSE, serviceId, reference, documentPublicId?, expiresAt? }` (`reference` obligatoria). El backend verifica que el `publicId` sea de su carpeta (uno ajeno → `404`), consulta a Cloudinary el formato y el peso **reales** (no la extensión) y, si no cumplen, borra el archivo y responde `422 INVALID_DOCUMENT`. Persiste solo `publicId`, formato y peso.

**Moderación: `npm run verification:review`** (no hay panel ni endpoint HTTP, tampoco "oculto"):

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
4. **Primer deploy**: las migraciones corren en el pre-deploy. Después, desde el Shell del servicio, cargar el catálogo con `npm run seed:catalog` (seguro e idempotente). El seed de desarrollo **no** se corre en producción.
5. **Verificar**: `GET https://<servicio>.onrender.com/api/v1/health` → `{"status":"ok","database":"up"}` y la documentación en `/api/docs`.
6. **Frontend**: poner la URL en `src/environments/environment.ts` (`apiUrl: 'https://<servicio>.onrender.com/api/v1'`) y empezar a reemplazar los mocks usando `src/app/core/api/`.
