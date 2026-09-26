# Resuelve

Marketplace local de servicios profesionales (Tandil).

```text
resuelve/
  src/        frontend Angular 22 (Tailwind, signals). Mocks restantes ("Tu mes", Plan y el inicio demo sin perfil) en src/app/core/data
  backend/    API REST NestJS + PostgreSQL → ver backend/README.md
```

## Frontend

Requiere Node 22.22.3+ o 24.15+ (lo exige Angular CLI 22).

```bash
npm ci
npm start          # http://localhost:4200
npm run build      # build de producción (prerender estático)
npm test           # Vitest
```

- `src/styles.css` define los tokens de la identidad: colores, escala de radios (6/8/10/12/16 px), sombras (solo para elementos flotantes) y motion.
- `src/environments/environment*.ts` define `apiUrl`: `http://localhost:3000/api/v1` en desarrollo (`ng serve`) y `https://resuelve-k3k5.onrender.com/api/v1` en producción. Ningún servicio ni componente tiene URLs escritas a mano.
- `src/app/core/api/` es la única capa HTTP (`HttpClient` + `API_URL`).

### Catálogo (integrado con la API)

Categorías y servicios vienen **solo** del backend: `GET /api/v1/categories` y `GET /api/v1/services` (`CatalogApiService`), guardados en `CatalogStore` (signals).

- Se cargan una vez por sesión, en el navegador. En el prerender no se pide nada: el HTML sale con un esqueleto y el catálogo llega al hidratar.
- Si la API falla se muestra "No pudimos cargar los servicios" con **Reintentar**. No hay respaldo con datos mock.
- La API devuelve solo activos, ya ordenados por `sortOrder`. Ese orden no representa popularidad.
- Los pedidos guardan el servicio como `{ id, slug, name }`. El `id` es el UUID real, que se usará al enviar solicitudes al backend. Las rutas y los mocks usan el `slug`.
- "Servicios más pedidos" del Home es una selección de slugs del frontend (`FEATURED_SERVICE_SLUGS`). Nombre y matrícula salen de la API; si un slug no existe en el catálogo, no se muestra.
- Siguen siendo mock: "Tu mes", Plan y el inicio demo del área pro sin perfil. También algunos textos de apoyo por servicio (trabajos típicos y título por defecto).
- Diferencias con el catálogo anterior del frontend: "Destapaciones" no existe en el backend y se atiende como Plomería. "Limpieza" (de casas) tampoco existe; el backend tiene "Limpieza de terrenos", que es otro servicio, así que no se mapea. "Cámaras" pasó a "Cámaras y alarmas". Redes y Reparación de electrodomésticos son nuevos y aparecen solos.

### Profesionales (integrados con la API)

El backend es la **única** fuente de profesionales. No quedan profesionales ficticios en el frontend y no hay respaldo mock: si la API falla se muestra un error con **Reintentar**, y si devuelve cero se muestra un estado vacío real.

- **Endpoints:** `GET /api/v1/professionals` (paginado `{ items, page, pageSize, total }`) y `GET /api/v1/professionals/:id` (`ProfessionalsApiService`). Las zonas salen de `GET /api/v1/zones?city=tandil` (`CatalogApiService.getZones`).
- **Query params reales:** `service` (el frontend manda siempre el UUID: `slug → id` con `CatalogStore`), `zone` (UUID), `availableToday`, `licenseVerified` (solo para servicios con `requiresLicense`), `minRating`, `page` y `pageSize` (máximo 50). No hay búsqueda por texto ni orden configurable.
- **Orden:** lo fija el backend: primero los disponibles hoy, después por rating y cantidad de reseñas. La UI lo describe tal cual, sin "Recomendados".
- **Paginación:** de 20 en 20. "Ver más profesionales" pide la página siguiente al backend; nunca se pagina en el cliente.
- **Estado:** `ProfessionalsStore` (signals: `items`, `selected`, `loading`, `detailLoading`, `error`, `detailError`, `filters`, `loaded`) no repite requests para los mismos filtros ni para el mismo perfil. `HomeProfessionalsStore` maneja el Home. En el prerender no se pide nada: `/profesionales` sale con esqueleto.
- **Qué se muestra:** solo lo que devuelve el contrato público: nombre, avatar (o iniciales), headline, bio, servicios, zonas de trabajo, "Disponible hoy", rating, reseñas, trabajos por Resuelve, años de experiencia, verificaciones aprobadas y portfolio.
- **Qué no se muestra:** el backend nunca expone email, teléfono, dirección, plan ni estados internos de verificación (`PENDING`), y hay tests e2e que lo comprueban. `averageResponseMinutes` existe en el contrato, pero ningún proceso lo calcula, así que la UI no lo muestra. No hay distancia, mapa, "próximo turno", precios ni rankings.
- **Rating:** sin reseñas, el backend devuelve `averageRating: null` (no `0`) y la UI dice "Sin reseñas todavía". El rating nunca se recalcula en el cliente.
- **Matrícula:** que el servicio la requiera (`requiresLicense`) no alcanza. "Matrícula verificada" aparece solo si el profesional tiene una verificación `LICENSE` aprobada para ese servicio.
- **Home:** no hay ranking en el backend, así que "Profesionales en Tandil" muestra los primeros según el orden del backend y "Disponibles hoy" muestra quienes lo marcaron. Los números salen de la API.
- **Pedido:** "Solicitar presupuesto" guarda en `RequestStore` una referencia mínima real `{ id, displayName, firstName, avatarUrl }` más el `serviceId` real, y se envía al backend (ver "Solicitudes, invitaciones y presupuestos").

**Datos de prueba en staging/producción.** No se usa el seed de desarrollo. El script crea hasta 2 profesionales de prueba con la API real (registro, "Modo profesional" y disponibilidad), con datos obviamente de prueba (`Profesional de prueba N`, emails `@resuelve.test`, sin teléfono, sin verificaciones ni portfolio):

```bash
cd backend && npm run build
TEST_PRO_PASSWORD='una-clave-larga' npm run fixture:test-pros -- create --api https://resuelve-k3k5.onrender.com/api/v1 --count 2
# Eliminarlos (usa DATABASE_URL; borra solo esos emails, en cascada):
npm run fixture:test-pros -- remove
```

"Disponible hoy" vence a medianoche: correr `create` de nuevo lo renueva (es idempotente).

**Mocks.**
- **Eliminados:** `professionals.data.ts` (el catálogo ficticio), `ProfessionalsService`, `mock-media.ts` (fotos de randomuser.me), el portfolio de ejemplo por servicio, `URGENT_AVAILABLE_NOW` y la compatibilidad `serviceSlugs` de profesionales.
- **Siguen mock:** las pantallas demo del área `/pro` (dashboard salvo sus solicitudes, agenda, estadísticas y plan). El perfil (`/pro/perfil`) ya es real. Muestran un aviso de demostración; "Ver perfil público" solo aparece si el usuario tiene un `professionalProfileId` real. La identidad (nombre, iniciales o foto) es siempre la del usuario autenticado; sin sesión dice "Profesional de ejemplo".

### Solicitudes, invitaciones y presupuestos (integrados con la API)

Circuito real: cliente → solicitud → invitaciones → profesional → presupuesto → aceptación → profesional seleccionado.

**Endpoints usados (sin rutas paralelas):**

| Acción | Endpoint | Servicio |
| --- | --- | --- |
| Crear solicitud (nace en `DRAFT`) | `POST /requests` | `RequestsApiService.createRequest` |
| Invitar (máx. 3; `DRAFT → WAITING_QUOTES`) | `POST /requests/:id/invitations` | `inviteProfessionals` |
| Reintentar una solicitud creada sin invitar | `PATCH /requests/:id` | `updateRequest` |
| Mis solicitudes (paginado, `?status=`) | `GET /requests/mine` | `getMyRequests` |
| Detalle | `GET /requests/:id` | `getRequestById` |
| Cancelar | `POST /requests/:id/cancel` | `cancelRequest` |
| Presupuestos de una solicitud | `GET /requests/:id/quotes` | `QuotesApiService.getQuotesForRequest` |
| Aceptar presupuesto (transaccional) | `POST /quotes/:id/accept` | `acceptQuote` |
| Solicitudes del profesional (`?status=` de la invitación) | `GET /pro/requests` | `ProRequestsApiService.getRequests` |
| Detalle para el profesional | `GET /pro/requests/:id` | `getRequestById` |
| "No disponible" | `POST /pro/requests/:id/decline` | `decline` |
| Enviar presupuesto | `POST /pro/requests/:id/quote` | `QuotesApiService.createQuote` |
| Perfil propio ("Disponible hoy") | `GET /pro/me` | `ProProfileApiService.getMe` |
| Cambiar "Disponible hoy" | `PATCH /pro/availability` | `setAvailability` |

- **Estados:** los del backend, sin traducir en la lógica (`DRAFT`, `WAITING_QUOTES`, `QUOTES_RECEIVED`, `PROFESSIONAL_SELECTED`, `SCHEDULED`, `COMPLETED`, `CANCELLED`; `AWAITING_REVIEW` y `CLOSED` son legacy y se muestran como "Trabajo realizado"). Textos y colores salen de un único mapper (`core/models/request-status.ts`). El frontend nunca cambia un estado por su cuenta: siempre usa la respuesta del backend y refresca.
- **Zona real:** el pedido guarda `zone: { id, name }` de `GET /zones` y envía `zoneId`. Se eliminó la lista de barrios del frontend ("Otro barrio" y "Usar mi ubicación" incluidos): si tu barrio no está, se elige el más cercano. Sin barrio no se puede enviar.
- **Envío:** con sesión, `POST /requests` y después `POST /invitations`. El botón se deshabilita mientras envía (un doble click no crea dos solicitudes). Si la creación sale bien y la invitación falla, se recuerda el id creado y el reintento solo invita (PATCH + invitations): nunca se crea una segunda solicitud. **El backend no tiene clave de idempotencia**; la protección es del frontend. Ningún POST se reintenta automáticamente (Render Free puede tardar en despertar: se espera con el botón en "Enviando…").
- **Sin sesión:** se va a `/ingresar?returnUrl=/presupuesto` y se vuelve con el pedido intacto, incluso si se recarga la página.
- **Urgencias:** el backend no tiene una acción de "toma directa" (una urgencia es una solicitud más). "Tomar trabajo" usa el mismo contrato que un presupuesto: el profesional manda su precio y el cliente lo confirma. El backend solo deja invitar a una urgencia a quien marcó "Disponible hoy".
- **Privacidad (la decide el backend):** el profesional invitado ve servicio, descripción, barrio, urgencia, fecha y el nombre del cliente con la inicial del apellido. Dirección exacta, teléfono y nombre completo llegan en `contact` solo al profesional elegido mientras el trabajo está activo. El cliente no recibe datos de contacto del profesional (el backend no los devuelve). Hay e2e para la lista y el detalle.
- **Presupuestos:** el formulario manda descripción, mano de obra y materiales (monto o ítems con concepto, cantidad y precio unitario), "desde cuándo" y validez. Nunca `totalAmount`: el total que se ve antes de enviar es una vista previa en centavos, y después se muestra el que devuelve el servidor. Un presupuesto activo por profesional y solicitud: ante 409 se muestra "Ya enviaste un presupuesto para esta solicitud." La edición existe en el backend (`PATCH /pro/quotes/:id`) pero no se integró en esta iteración.
- **Comparar:** total, mano de obra, materiales, ítems, fechas, rating y reseñas reales, identidad y matrícula verificadas y "Disponible hoy" (de `GET /professionals/:id`). No hay ganadora automática.
- **Aceptar:** pide confirmación, no cambia nada local antes de la respuesta y después refresca solicitud y presupuestos. Si otra pestaña ganó (409), se refresca y se muestra "Esta solicitud ya tiene un profesional seleccionado."
- **Cancelar:** solo en estados que el backend permite, con confirmación.
- **Refresco:** sin polling. Hay botón "Actualizar", se recarga al entrar y al volver a la pestaña (como mucho cada 30 s).
- **Fotos:** el backend solo acepta URLs https y todavía no hay upload (Cloudinary firmado queda para otra iteración). Se quitaron los selectores de fotos simulados y se avisa que por ahora no se adjuntan.

**Persistencia (sessionStorage, clave `resuelve.requestDraft`):**
- Se guarda: servicio (id, slug, nombre), barrio (id, nombre), título, descripción, urgencia, fecha deseada, referencias públicas de los profesionales elegidos (id, nombre, avatar, rating) y el id de una solicitud creada que quedó sin invitar.
- **No** se guarda: dirección exacta (solo en memoria), tokens, datos del usuario ni fotos.
- Se limpia cuando la solicitud se envía, al descartar el pedido, si pasaron más de 12 h o si el contenido es inválido (incluidos ids que no son UUID).

**UX de estados (representación, sin tocar la máquina de estados):**
- **Estado personal del profesional:** el estado global (`PROFESSIONAL_SELECTED`) se muestra distinto según la invitación que manda el backend: "Te eligieron" (con el global "Profesional seleccionado" como dato secundario) o "El cliente eligió otro presupuesto". Un solo helper: `proPersonalState()` en `features/pro/pro-ui.ts`.
- **Progreso del cliente:** 4 pasos derivados del estado real (`requestProgress()` en `request-status.ts`); cancelada no muestra progreso.
- **Confirmaciones:** aceptar y cancelar usan un `<dialog>` modal nativo (`shared/components/dialog`): foco atrapado, Escape, `aria-labelledby`, retorno de foco; centrado en desktop y bottom sheet en mobile. Después de elegir desaparecen "Elegir" y "Comparar"; los presupuestos quedan "Aceptado" / "No elegido".
- **Montos:** los inputs muestran `$` y separador de miles mientras se escribe; al API siempre va el número. Desde $ 1.000.000 se muestra la escala ("≈ 304 millones") y desde $ 10.000.000 un aviso de monto alto que no bloquea. Antes de enviar dice "Total estimado"; después, "Total" (el del servidor).

**"Disponible hoy" (real):** el switch lee `GET /pro/me` y guarda con `PATCH /pro/availability` (vence a medianoche, hora de Argentina). Si todavía no se sabe el valor real (sin perfil profesional o sin respuesta) no se muestra; si el guardado falla, vuelve al valor anterior. **Plan / uso mensual:** el backend tiene el contador y el límite Free, pero los planes comerciales no están definidos: el bloque "Plan Free · N de 10" se quitó del sidebar (la pantalla Plan sigue como demo con aviso).

**Datos de prueba:** profesionales con `npm run fixture:test-pros` (ver arriba). Cliente: una cuenta nueva desde `/registro`, con email `@resuelve.test`. Limpieza: `fixture:test-pros -- remove` borra los profesionales, y en cascada sus invitaciones y presupuestos. Una cuenta de cliente de prueba se borra con `DELETE FROM users WHERE email = '…@resuelve.test';`, y en cascada sus solicitudes, invitaciones y presupuestos.

**Mocks.**
- **Eliminados:** `client-requests.data.ts` y `ClientRequestsStore` (Mis solicitudes mock, profesionales embebidos, presupuestos y reseñas mock), `INCOMING_REQUESTS`, el borrador de presupuesto mock, `CLIENT_SUMMARY`, contadores y actividad ficticios de solicitudes, `NEIGHBORHOODS` y los selectores de fotos simulados.
- **Restantes:** dashboard pro (salvo sus solicitudes, contadores e identidad, que son reales), agenda, estadísticas, planes y perfil pro (con aviso de demostración).

**Deuda explícita.**
- "Tu mes" y Plan siguen demo y **no figuran en la navegación** (las rutas existen para desarrollo, con aviso). El inicio demo solo lo ve quien no tiene perfil profesional.
- Sin notificaciones (push/email) ni sincronización de calendarios: la coordinación se ve al entrar, con "Actualizar" o al volver a la pestaña.
- Uploads de fotos siguen fuera.
- El refresh token sigue temporalmente en `sessionStorage`.
- El backend no tiene idempotencia en `POST /requests` ni `POST /quote`.
- No hay notificaciones: el profesional ve las solicitudes nuevas al entrar o al actualizar.

### Coordinación del trabajo y Agenda (integradas con la API)

Después de elegir un presupuesto: el profesional propone fecha y horario, el cliente confirma o pide otro, queda agendado y, cuando termina el horario, cualquiera de los dos confirma que se realizó (o pide reprogramar). Reglas y endpoints: `backend/README.md` → "Coordinación del trabajo y agenda".

- **API:** `AppointmentsApiService` (proponer, confirmar, rechazar, cancelar horario, completar, agenda, pendientes de cierre) y `RequestsApiService.complete` (el mismo `POST /requests/:id/complete` para cliente y profesional). Cada acción devuelve la solicitud actualizada vista por quien actúa; la UI usa esa respuesta (sin F5) y ante un `409` relee la solicitud y lo explica.
- **Profesional elegido** (`/pro/solicitudes/:id`): "Te eligieron" → **Coordinar trabajo** (diálogo: fecha, hora, duración estimada 30 min–8 h, nota opcional; no vuelve a pedir cliente, servicio ni dirección). Después: "Esperando confirmación" + **Cambiar propuesta**; "El cliente necesita otro horario" + **Proponer otra fecha**; "Trabajo agendado" + **Ver en agenda** / **Reprogramar**. Cuando termina el horario, el bloque pasa a "¿Terminaste este trabajo? · El horario agendado ya pasó." con **Marcar como realizado** (con confirmación) y **Necesito reprogramar** (nueva propuesta; la solicitud sigue con él). "Trabajo realizado" es de solo lectura. Las acciones salen de `proCoordination()` (`pro-ui.ts`); el perdedor nunca las ve.
- **Cliente** (`/mis-solicitudes/:id`): "Profesional elegido · Esperando coordinación" → "Horario propuesto" con **Confirmar horario** / **No puedo en ese horario** → bloque "Trabajo agendado" (fecha, horario, profesional, dirección, **Cancelar horario**, distinto de "Cancelar solicitud") → cuando termina el horario, "¿Se realizó el trabajo?" reemplaza a "Cancelar horario": **Sí, se realizó** ("Confirmar trabajo realizado") o **No, necesitamos reprogramar** ("Volver a coordinar": la cita se cancela y el mismo profesional propone otra fecha) → "Trabajo realizado" → reseña opcional (ver "Reseñas y reputación"). El progreso de 4 pasos termina en "Coordinar trabajo" → "Trabajo agendado" → "Trabajo realizado".
- **Agenda** (`/pro/agenda`, real, `professionalGuard`): `AgendaStore` pide una semana (lunes a domingo, hora de Argentina) a `GET /pro/appointments?from&to`. Desktop: columnas por día, hoy destacado, línea de "ahora", anterior/hoy/siguiente y un panel con el trabajo seleccionado ("Ver solicitud"). Mobile: días de la semana + lista del día (cada trabajo abre la solicitud). Confirmados en Forest, sin confirmar secundarios (borde punteado), realizados apagados; canceladas y rechazadas no aparecen. Arriba, "N trabajos pendientes de cierre" (de cualquier semana, `GET /pro/appointments/completion-due`) con **Marcar como realizado**; en la grilla dicen "Pendiente de cierre". Vacío y error reales, sin mocks.
- **Estado contextual** (`clientStage`, `core/models/request-status.ts`): "Horario por confirmar" (propuesta pendiente) y "Pendiente de confirmar" (horario terminado) en la tarjeta y el detalle, sin otro estado persistido. Se recalcula con la hora actual para cambiar sin recargar.
- **Filtros de "Mis solicitudes"** (`?group=`): Todas · Activas · Presupuestos · Por coordinar · Agendadas · Realizadas · Canceladas.
- **Hora:** todo se muestra y se arma en `America/Argentina/Buenos_Aires` (`core/utils/business-time.ts`), sin depender de la zona del navegador. Lo que se envía lleva `-03:00`.
- **Diálogos:** `<dialog>` modal (foco atrapado, Escape, retorno de foco, bottom sheet en mobile); no se cierran ni repiten el POST mientras guardan.

### Perfil profesional (integrado con la API)

`/pro/perfil` es real (antes demo): sale de `GET /pro/me` y exige sesión + `professionalProfileId`. No repite el onboarding: secciones que muestran el estado actual y se editan y guardan por separado (loading localizado, error recuperable, sin doble envío).

- **Presentación:** título, bio y años (`PATCH /pro/profile`).
- **Servicios:** agregar/quitar por `serviceId`. Cada uno muestra su matrícula ("Matrícula pendiente / en revisión / verificada / rechazada / vencida") y si aparece o no en búsquedas.
- **Cobertura:** "¿Dónde trabajás? · Todo Tandil / Solo algunos barrios" (`coversEntireCity` + UUID reales de `GET /zones`). Volver a "Solo algunos barrios" recupera los barrios guardados. Lo mismo en el onboarding.
- **Disponibilidad y visibilidad:** "Disponible hoy" (misma fuente que el switch del sidebar) y "Pausar perfil" con confirmación (`PATCH /pro/status`), separados.
- **Verificaciones:** por cada servicio que requiere matrícula: estado, referencia, fechas y motivo de rechazo. Enviar/reenviar: número de matrícula (lo que se verifica, contra el registro oficial), vencimiento opcional y un documento opcional de respaldo (PDF/JPG/PNG/WebP ≤ 10 MB, con progreso). El archivo va directo al almacenamiento privado con una firma del backend; nunca se muestra ni se guarda una URL.
- **"Perfil completo":** solo con criterios reales (presentación, un servicio habilitado, cobertura); sin porcentajes.
- Después de guardar, `ProfessionalsStore` y los destacados del inicio se invalidan: el perfil público se ve actualizado sin F5.
- Portfolio y avatar: ocultos hasta tener un pipeline público de imágenes (el privado de matrículas no se usa para eso).
- Moderación y reglas de backend: ver `backend/README.md` → "Núcleo profesional".

### Auth (integrada con la API)

Registro, login, refresh, logout y usuario actual contra `/api/v1/auth/*` (`AuthApiService`). El estado vive en `AuthStore` (signals: `user`, `accessToken`, `authenticated`, `initializing`, `loading`, `error`).

**Transporte actual de tokens (TRANSITORIO):**

```text
Current auth transport:
- access token: memory only (AuthStore). Never persisted.
- refresh token: sessionStorage (key resuelve.refreshToken). Lost when the tab/browser session closes.
- temporary while frontend/backend use Vercel/Render third-party domains
  (resuelve-pearl.vercel.app ↔ resuelve-k3k5.onrender.com)

Planned production hardening:
- move refresh token to HttpOnly Secure cookie
- use same-site custom domains (e.g. resuelve.com.ar + api.resuelve.com.ar)
```

> **TODO producción final:** migrar el refresh token a cookie `HttpOnly + Secure` cuando usemos dominios propios/same-site. Hasta entonces el backend mantiene el contrato actual (tokens en el body) y el frontend **no** usa `withCredentials`.

No se cifra el token en el frontend (una clave en el bundle no protege nada). Nunca se loguean contraseñas ni tokens.

- **Restaurar sesión (F5):** al arrancar en el navegador, si hay un refresh token en sessionStorage se llama `/auth/refresh`, que lo rota, y después `/auth/me`. `AuthStore.initialize()` corre una sola vez por carga (desde `App`) y `AuthStore.status()` tiene tres estados: `initializing`, `authenticated` y `unauthenticated`. `initializing` **no** equivale a invitado: el header muestra un lugar reservado en vez de "Ingresar", las pantallas personales muestran "Cargando tu sesión…" y el área `/pro` muestra "Cargando tu cuenta…". En SSR/prerender queda en `initializing`, no se toca sessionStorage ni se llama al backend.
- **Qué cierra la sesión:** solo un 401 del backend (`sessionRejected`: refresh vencido, revocado o reusado fuera de la ventana de gracia). Una request cortada por la recarga (status 0), un backend caído o un 5xx **no** borran el refresh token: esa carga queda sin sesión, pero la siguiente la recupera. Antes cualquier error la borraba, y con F5 repetido el `error` de la request abortada vaciaba sessionStorage mientras la página se descargaba: ese era el "deslogueo" al recargar.
- **Interceptor (`core/auth/auth.interceptor.ts`):** agrega `Authorization: Bearer` solo a requests a `API_URL` y solo con sesión. Ante un 401 hace un único refresh, compartido por todas las requests concurrentes (`AuthStore.refresh()` reutiliza el que está en vuelo), y reintenta la request original una sola vez. Nunca actúa sobre login, register, refresh ni logout (`SKIP_AUTH`), así que no puede entrar en loop. Si el backend rechaza el refresh (401), cierra la sesión local, muestra un único aviso y manda a `/ingresar?returnUrl=<ruta segura>` solo si la pantalla actual es personal (`data.requiresAuth`). Si el refresh se cortó o el backend no respondió, la request falla sola y la sesión sigue.
- **Rutas:** `/ingresar` y `/registro` (Reactive Forms, validaciones alineadas con el DTO y el backend como autoridad). `authGuard` protege `/perfil`, `/mis-solicitudes` y `/mis-solicitudes/:id`. Home, `/servicios`, `/profesionales` y los perfiles públicos no se protegen.
- **`returnUrl`:** se aceptan solo rutas internas (`safeReturnUrl`). Se rechazan `https://…`, `//host`, `\`, esquemas como `javascript:`, caracteres de control y las propias rutas de auth.
- **Enviar solicitud sin sesión:** el pedido queda en `RequestStore` y en sessionStorage (solo lo no sensible). Se va a `/ingresar?returnUrl=/presupuesto` y, después de ingresar o registrarse, se vuelve con el pedido intacto, incluso tras recargar.
- **Registro:** el backend devuelve tokens, así que la sesión queda iniciada.
- **Errores:** los mensajes salen de `status` y `code`, nunca del `message` de Nest. 401 → "Email o contraseña incorrectos." (no revela si el email existe). 429 → "Demasiados intentos…", sin reintento automático. Red o 5xx → "No pudimos iniciar sesión…". 409 `EMAIL_ALREADY_REGISTERED` → error en el campo email. No hay timeouts: Render Free puede tardar en despertar, y a los 5 s se avisa que el servidor está despertando.
- **Logout:** es idempotente. Limpia local primero y después revoca en `/auth/logout`; aunque el backend falle, la sesión local queda cerrada.
- **Perfil:** nombre, apellido, email, teléfono y avatar salen de `/auth/me`. El backend todavía no tiene endpoint de edición, así que los datos se muestran pero no se editan.
- **Mocks eliminados:** `CLIENT_USER` (la identidad mock del cliente en header y perfil).
- **Mocks eliminados del panel:** la versión demo de `/pro/dashboard` ("Tu mes" con $487.000, "Actividad reciente") y la identidad "Profesional de ejemplo" de `ProStore.me` (sin sesión es `null`). Ninguna pantalla real usa datos de ejemplo como respaldo: sin datos hay carga, vacío, error con reintento o redirect.
- **Siguen demo:** "Tu mes" (`/pro/estadisticas`) y Plan. Están fuera de la navegación, detrás de `professionalGuard` y con el aviso "Pantalla de demostración".
- **Área `/pro`:** TODO `/pro/**` exige sesión y `professionalProfileId` (`professionalGuard`; el backend igual responde 403 `PROFESSIONAL_PROFILE_REQUIRED`). Sin sesión → `/ingresar?returnUrl=…`; sin perfil → `/soy-profesional`. `ProShell` no monta el panel sin usuario: mientras se restaura la sesión (y en el HTML prerenderizado) solo muestra "Resuelve · Cargando tu cuenta…".
- **Pestaña duplicada / recarga que corta la respuesta del refresh:** el navegador puede quedarse con un refresh token que el backend ya rotó (sessionStorage copiado al duplicar la pestaña, o F5 antes de recibir la respuesta). El backend lo acepta como reintento dentro de `REFRESH_REUSE_GRACE_SECONDS` (ver `backend/README.md` → "Seguridad"); fuera de esa ventana sigue siendo reuso y cierra todas las sesiones.

## Backend

Ver [backend/README.md](backend/README.md): instalación, variables de entorno, migraciones, seed, tests, Swagger y los pasos para Render.

## Notificaciones in-app

Que un presupuesto nuevo o un trabajo sin cerrar no pasen desapercibidos, sin push/email y sin llenar la app de puntos rojos. Backend: `backend/README.md` → "Notificaciones in-app".

- **`NotificationsStore`** (`core/state/notifications.store.ts`): lo conecta la raíz de la app (`connect()`). Con sesión consulta `GET /me/notifications/summary` al iniciar, cada 60 s, al volver a la pestaña y después de acciones propias (aceptar, confirmar, cerrar…); si hay no leídas, trae la lista de ese modo. Sin WebSocket.
- **Badges** (texto accesible, no solo color): "Mis solicitudes" (header y "Solicitudes" en mobile) = novedades del cliente + trabajos por confirmar ("2 novedades en Mis solicitudes"). Modo profesional aparte: "Solicitudes" = invitaciones nuevas + novedades profesionales; "Agenda" = trabajos pendientes de cierre. "Modo profesional" en el header del cliente suma solo lo profesional.
- **Tarjetas**: "Nuevo presupuesto" / "2 presupuestos nuevos" / "Nuevo horario propuesto" (cliente) y "Novedad: Horario confirmado / Necesitan otro horario / Te eligieron" (profesional).
- **Leído**: abrir `/mis-solicitudes/:id` (o `/pro/solicitudes/:id`) marca leídas solo las de esa solicitud y modo; el badge baja sin F5.
- **Toast**: si durante la consulta aparece algo nuevo, un aviso discreto una sola vez ("Nuevo presupuesto para “Problema eléctrico”." + **Ver**). La primera carga después de ingresar no anuncia nada, y si ya estás en esa solicitud se relee en lugar de avisar. Las pantallas abiertas (listado, detalle) se releen solas.
- **Dashboard profesional**: "N trabajos pendientes de confirmar · Revisá si ya terminó…" + **Revisar** (a la Agenda).

## Reseñas y reputación

Reputación **real**: sale solo de reseñas de trabajos hechos por Resuelve. Nada de reseñas, ratings ni badges precargados.

- **Dejar reseña** (`/mis-solicitudes/:id`, `review-panel.ts`): el CTA "¿Cómo fue tu experiencia con {nombre}?" aparece solo si el backend devuelve `canReview: true` (trabajo `COMPLETED`, cliente dueño, sin reseña previa; da igual quién lo cerró). Con el horario terminado pero todavía `SCHEDULED` no hay reseña: primero se confirma que el trabajo se hizo. Formulario: estrellas 1–5 (radios nativos: teclado, foco visible, lector de pantalla), comentario opcional de hasta 1000 caracteres en texto plano y el aviso "Tu reseña y tu nombre de pila podrán verse en el perfil del profesional". Un solo POST (sin doble envío), error recuperable, agradecimiento y después "Tu reseña", sin CTA. El profesional lo decide el backend, no el formulario.
- **Perfil público** (`profile-reviews.ts`): "Opiniones" con promedio a 1 decimal, cantidad (singular/plural), distribución y reseñas más recientes primero (sin ocultar críticas), paginadas con "Ver más reseñas" (`GET /professionals/:id/reviews`). Cada reseña muestra solo el nombre de pila y el mes ("María · septiembre 2026"). Sin reseñas: "Todavía no tiene reseñas".
- **Dónde aparece**: header del perfil, cards de resultados, Home/urgencias, destinatarios del pedido, presupuestos y comparador ("★ 4,8 · 23 reseñas" o "Sin reseñas todavía") y el panel profesional ("Tu presencia en Resuelve"). No hay "Recomendado", "Top" ni orden por rating nuevo.
- Textos compartidos en `core/utils/reputation.ts`; estrellas en `shared/components/stars`.

## Login y marca del área profesional

- Después de ingresar (`afterLoginUrl`, en `core/auth/return-url.ts`): 1) `returnUrl` interno y seguro; 2) si la cuenta tiene `professionalProfileId` → `/pro/dashboard`; 3) si no → `/perfil`. Una `returnUrl` externa se ignora. Lo mismo aplica si alguien con sesión abre `/ingresar`.
- El logo del sidebar es solo "Resuelve" (sin badge "Pro"): "Resuelve PRO" queda reservado para el futuro plan pago. Nomenclatura: "Modo profesional", "Panel profesional", "Mi perfil profesional". Los títulos de pestaña del área son "… · Panel profesional".
