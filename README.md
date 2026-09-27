# Resuelve

Marketplace local de servicios profesionales (Tandil).

```text
resuelve/
  src/        frontend Angular 22 (Tailwind, signals). Sin pantallas demo: todo el panel usa datos reales
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
- **Clasificación del texto** (`core/utils/interpret-request.ts`): determinística y por niveles sobre el catálogo real: 1) frases/alias exactos ("pc", "notebook", "me quedé afuera"), 2) palabras clave y el nombre del servicio (palabras completas; `pint*` = raíz), 3) sin coincidencia fuerte y única **no se elige nada**: "No estamos seguros del servicio." con 0–3 opciones reales + buscador. Antes eran regex por substring con fallback fijo a Plomería: "PC" no coincidía con nada y caía en "Plomería · Consulta general". El buscador de servicios también entiende ese vocabulario ("notebook" → Reparación de PC).
- **Íconos de servicios**: un solo mapa `slug → ícono` (`core/utils/service-icons.ts`) dibujado por `app-service-icon` (mismo trazo que el set de la app, geometría de Lucide, sin librería extra). Servicio sin entrada → ícono neutro. Se usan en Servicios más pedidos, /servicios, el buscador, "Entendimos esto" y los servicios del perfil.
- "Servicios más pedidos" del Home es una selección de slugs del frontend (`FEATURED_SERVICE_SLUGS`). Nombre y matrícula salen de la API; si un slug no existe en el catálogo, no se muestra.
- Siguen siendo texto fijo algunos apoyos por servicio (trabajos típicos y título por defecto). "Tu mes" y Plan ya son reales (ver "Tu mes, Free y PRO").
- Diferencias con el catálogo anterior del frontend: "Destapaciones" no existe en el backend y se atiende como Plomería. "Limpieza" (de casas) tampoco existe; el backend tiene "Limpieza de terrenos", que es otro servicio, así que no se mapea. "Cámaras" pasó a "Cámaras y alarmas". Redes y Reparación de electrodomésticos son nuevos y aparecen solos.

### Profesionales (integrados con la API)

El backend es la **única** fuente de profesionales. No quedan profesionales ficticios en el frontend y no hay respaldo mock: si la API falla se muestra un error con **Reintentar**, y si devuelve cero se muestra un estado vacío real.

- **Endpoints:** `GET /api/v1/professionals` (paginado `{ items, page, pageSize, total }`) y `GET /api/v1/professionals/:id` (`ProfessionalsApiService`). Las zonas salen de `GET /api/v1/zones?city=tandil` (`CatalogApiService.getZones`).
- **Query params reales:** `service` (el frontend manda siempre el UUID: `slug → id` con `CatalogStore`), `zone` (UUID), `availableToday`, `licenseVerified` (solo para servicios con `requiresLicense`), `minRating`, `page` y `pageSize` (máximo 50). No hay búsqueda por texto ni orden configurable.
- **Orden:** lo fija el backend: primero los disponibles hoy, después por rating y cantidad de reseñas. La UI lo describe tal cual, sin "Recomendados".
- **Paginación:** de 20 en 20. "Ver más profesionales" pide la página siguiente al backend; nunca se pagina en el cliente.
- **Estado:** `ProfessionalsStore` (signals: `items`, `selected`, `loading`, `detailLoading`, `error`, `detailError`, `filters`, `loaded`) no repite requests para los mismos filtros ni para el mismo perfil. `HomeProfessionalsStore` maneja el Home. En el prerender no se pide nada: `/profesionales` sale con esqueleto.
- **Qué se muestra:** solo lo que devuelve el contrato público: nombre, avatar (o iniciales), headline, bio, servicios, zonas de trabajo, "Disponible hoy", rating, reseñas, trabajos por Resuelve, años de experiencia, verificaciones aprobadas y portfolio.
- **Qué no se muestra:** el backend nunca expone email, teléfono, dirección, uso ni vencimiento del plan, ni estados internos de verificación (`PENDING`); del plan solo se publica `pro` (PRO vigente), y hay tests e2e que lo comprueban. `averageResponseMinutes` existe en el contrato, pero ningún proceso lo calcula, así que la UI no lo muestra. No hay distancia, mapa, "próximo turno", precios ni rankings.
- **Rating:** sin reseñas, el backend devuelve `averageRating: null` (no `0`) y la UI dice "Sin reseñas todavía". El rating nunca se recalcula en el cliente.
- **Matrícula:** que el servicio la requiera (`requiresLicense`) no alcanza. "Matrícula verificada" aparece solo si el profesional tiene una verificación `LICENSE` aprobada para ese servicio.
- **Home:** no hay ranking en el backend, así que "Profesionales en Tandil" muestra los primeros según el orden del backend y "Disponibles hoy" muestra quienes lo marcaron. Los números salen de la API.
- **Explorar vs. pedido (`SearchStore.mode`):** `/profesionales` y `/profesionales?servicio=<slug>` exploran: listado limpio, sin "Tu pedido" (Home, menú, "Servicios más pedidos", /servicios). Solo `/profesionales?pedido=1` (desde "Crear solicitud") usa el pedido, y únicamente si `RequestStore.hasContext()` (lo escribió el cliente). El borrador inicial está vacío: no hay pedido, texto ni servicio de ejemplo. Explorando, "Solicitar presupuesto" arma un pedido nuevo y vacío con el servicio filtrado (`SearchStore.prepareRequest`).
- **"Profesionales destacados" del inicio:** `GET /professionals?pro=true` (solo PRO vigente que puede ocupar un espacio destacado: perfil activo, un servicio que ofrece públicamente —con matrícula aprobada si la requiere— y cobertura; orden rotado por día). Rotulada "Perfiles con Resuelve PRO. Espacio promocionado: no es una verificación ni una recomendación."; sin PRO elegibles, no se muestra.
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
- **Sin mocks en `/pro`:** dashboard, agenda, perfil, "Tu mes" y Plan son reales. La identidad (nombre, iniciales o foto) es siempre la del usuario autenticado.

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
- **¿Dónde es el trabajo? (`WorkLocationPicker`, `shared/components/work-location-picker`):** UNA sola experiencia en Crear solicitud (paso 2), Urgencias, Buscar → Solicitar presupuesto, perfil → Solicitar presupuesto y Editar; la pantalla solo pone el título. Orden: **Usar mi ubicación** (solo si el backend tiene proveedor: `GET /location/config`) → **Dirección** (autocompletado vía `POST /location/autocomplete` con combobox accesible, o texto libre) → **Barrio**, derivado y confirmable ("Barrio detectado · Villa Italia · Cambiar") o, si no se pudo, "No pudimos identificar el barrio. Elegí el más cercano" con los barrios reales. Nunca se elige uno silenciosamente. Permiso denegado, timeout o falla del proveedor muestran un aviso y se sigue a mano. Las coordenadas se mandan una vez al backend (`POST /location/reverse`) y se descartan; la dirección vive solo en memoria. El pedido guarda `zone: { id, name }` y envía `zoneId`; sin barrio no se puede enviar. Proveedor y reglas: `backend/README.md` → "Ubicación del trabajo".
- **Envío:** con sesión, `POST /requests` y después `POST /invitations`. El botón se deshabilita mientras envía (un doble click no crea dos solicitudes). Si la creación sale bien y la invitación falla, se recuerda el id creado y el reintento solo invita (PATCH + invitations): nunca se crea una segunda solicitud. **El backend no tiene clave de idempotencia**; la protección es del frontend. Ningún POST se reintenta automáticamente (Render Free puede tardar en despertar: se espera con el botón en "Enviando…").
- **Sin sesión:** se va a `/ingresar?returnUrl=/presupuesto` y se vuelve con el pedido intacto, incluso si se recarga la página.
- **Urgencias:** urgencia es un atributo del pedido, no una lista de rubros. Cerrajería, Plomería, Electricidad y Gas son atajos; **Otro servicio** busca en el catálogo real del backend (`ServicePicker`). Urgencias arranca con el servicio del pedido en curso y nunca lo cambia solo. Si nadie marcó "Disponible hoy" para ese servicio: "No encontramos profesionales disponibles hoy para Reparación de PC." y **Crear solicitud** (queda "Para hoy" y se elige entre los profesionales del servicio: una urgencia solo puede llegar a quien está disponible). Matrícula, cobertura y perfil activo siguen valiendo (backend). El backend no tiene una acción de "toma directa" (una urgencia es una solicitud más). "Tomar trabajo" usa el mismo contrato que un presupuesto: el profesional manda su precio y el cliente lo confirma. El backend solo deja invitar a una urgencia a quien marcó "Disponible hoy".
- **Privacidad (la decide el backend):** el profesional invitado ve servicio, descripción, barrio, urgencia, fecha y el nombre del cliente con la inicial del apellido. Dirección exacta, teléfono y nombre completo llegan en `contact` solo al profesional elegido mientras el trabajo está activo. El cliente no recibe datos de contacto del profesional (el backend no los devuelve). Hay e2e para la lista y el detalle.
- **Presupuestos:** el formulario manda descripción, mano de obra y materiales (monto o ítems con concepto, cantidad y precio unitario), "desde cuándo" y validez. Nunca `totalAmount`: el total que se ve antes de enviar es una vista previa en centavos, y después se muestra el que devuelve el servidor. Un presupuesto activo por profesional y solicitud: ante 409 se muestra "Ya enviaste un presupuesto para esta solicitud." La edición existe en el backend (`PATCH /pro/quotes/:id`) pero no se integró en esta iteración.
- **Comparar presupuestos:** total, mano de obra, materiales, ítems, fechas, rating y reseñas reales, identidad y matrícula verificadas y "Disponible hoy" (de `GET /professionals/:id`). No hay ganadora automática.
- **Comparar profesionales (`ComparisonStore`, única fuente):** resultados, tarjetas y el perfil público usan el mismo store (máx. 3, mínimo 2 para abrir el comparador), guardado en sessionStorage con datos públicos. Antes el botón del perfil cambiaba una selección de la pantalla de resultados sin mostrar nada, el comparador solo existía en `/profesionales` y entrar a resultados la vaciaba. Ahora: "Agregar a la comparación" → "✓ En comparación" + **Quitar** y la bandeja `CompareTray` ("Comparar profesionales", chips con **Quitar** accesible, **Agregar otro** que vuelve al listado con el mismo pedido o servicio, **Comparar N** deshabilitado con 1). El cuarto: "Podés comparar hasta 3 profesionales.". La fila "Matrícula (Servicio)" aparece solo con contexto de servicio.
- **Aceptar:** pide confirmación, no cambia nada local antes de la respuesta y después refresca solicitud y presupuestos. Si otra pestaña ganó (409), se refresca y se muestra "Esta solicitud ya tiene un profesional seleccionado."
- **Cancelar:** solo en estados que el backend permite, con confirmación.
- **Refresco:** sin polling. Hay botón "Actualizar", se recarga al entrar y al volver a la pestaña (como mucho cada 30 s).
- **Cierre del trabajo sin F5:** "pendiente de cierre" lo decide solo el backend (`completionDue` / `canComplete`, la misma regla que `POST /requests/:id/complete`); la UI no lo recalcula con el reloj del navegador. `refreshWhenDue` (`core/utils/refresh-when-due.ts`) programa UN timer para `endsAt` (+1 s) y relee; si el backend todavía no lo da por terminado (reloj corrido), reintenta cada 5 s (máx. 12). Lo usan el detalle del cliente y del profesional, Mis solicitudes, Solicitudes y la Agenda. Al vencer desaparece "Cancelar horario" y aparece "¿Se realizó el trabajo?" / "Marcar como realizado". Nunca completa nada.
- **Menú de cuenta único** (`layout/account-menu`): avatar + nombre abren "Mi perfil", el cambio de modo ("Modo profesional" / "Ver como cliente") y, separado, **Cerrar sesión** (logout real: `POST /auth/logout` y limpieza local una vez). Header desktop del cliente, identidad del sidebar profesional y header mobile profesional. Teclado: flechas, Escape cierra y devuelve el foco.
- **Fotos del pedido:** el backend solo acepta URLs https y todavía no hay upload para pedidos. Se quitaron los selectores de fotos simulados y se avisa que por ahora no se adjuntan.

**Pedido dirigido vs. descubrimiento (`RequestStore.flowMode`):**
- `DISCOVERY`: el cliente describe el problema y después busca ("Revisá tu pedido" → **Ver profesionales disponibles**). `TARGETED`: ya eligió a quién pedirle presupuesto (perfil, tarjeta, Urgencias o comparador). Es explícito y se guarda con el borrador; nunca se infiere de la URL.
- Editar título, descripción, urgencia, fecha, barrio o dirección **no** cambia el modo: en `TARGETED` el paso 5 muestra "Vas a pedir presupuesto a …" con **Solicitar presupuesto a Ariel** (nunca "Ver profesionales disponibles") y "Cambiar profesional" como acción secundaria.
- Solo rompe el target un cambio que lo vuelve inelegible (misma regla que el backend al invitar, con los datos públicos del profesional): servicio que no ofrece (los regulados, sin matrícula vigente), barrio que no cubre, o urgencia sin "Disponible hoy". Se explica ("Ariel ya no puede recibir este pedido con los cambios que hiciste.") y se ofrece **Buscar profesionales**, que pasa a `DISCOVERY` conservando el pedido. El backend revalida al enviar; si rechaza (`PROFESSIONAL_NOT_ELIGIBLE`) el error es recuperable ("Buscar otro profesional").
- "Editar" desde `/presupuesto` abre la revisión y, al terminar, vuelve a `/presupuesto` (`returnToQuote`: destino interno fijo, nunca una URL, así que no hay redirect abierto). "Editar" una fila de la revisión abre ese paso y, al elegir, vuelve a la revisión.
- `/presupuesto` dirigido dice "Tu pedido se enviará a Ariel." y, si hay lugar, que antes de enviarlo se pueden sumar profesionales (máx. 3). Faltantes se muestran como pendientes ("Falta elegir" + **Completar**, "Falta completar"), y servicio y título iguales se muestran una sola vez.
- No hay duplicados: la solicitud recién se crea al enviar; si la invitación falla se reintenta solo la invitación (`pendingRequestId`).

**Fecha del pedido:** una sola fuente, `desiredDate` (YYYY-MM-DD, date-only, día de **Argentina**, `core/utils/business-time`). "Cuándo" se deriva siempre ("Ahora", "Hoy", "Mañana", "Dom 4/10", "A coordinar" si no eligió). Antes había además una etiqueta `when` guardada con "Hoy" por defecto y "hoy" se calculaba con el huso del navegador.

**Persistencia (sessionStorage, clave `resuelve.requestDraft`, versión 2; la 1 se sigue leyendo):**
- Se guarda: servicio (id, slug, nombre), barrio (id, nombre), título, descripción, urgencia, fecha deseada, referencias públicas de los profesionales elegidos (id, nombre, avatar, rating, servicios que ofrece y cobertura), el modo del flujo, si hay que volver a "Solicitar presupuesto" y el id de una solicitud creada que quedó sin invitar.
- **No** se guarda: dirección exacta (solo en memoria), tokens, datos del usuario ni fotos.
- Se limpia cuando la solicitud se envía, al descartar el pedido, si pasaron más de 12 h o si el contenido es inválido (incluidos ids que no son UUID).

**UX de estados (representación, sin tocar la máquina de estados):**
- **Estado personal del profesional:** el estado global (`PROFESSIONAL_SELECTED`) se muestra distinto según la invitación que manda el backend: "Te eligieron" (con el global "Profesional seleccionado" como dato secundario) o "El cliente eligió otro presupuesto". Un solo helper: `proPersonalState()` en `features/pro/pro-ui.ts`.
- **Progreso del cliente:** 4 pasos derivados del estado real (`requestProgress()` en `request-status.ts`); cancelada no muestra progreso.
- **Confirmaciones:** aceptar y cancelar usan un `<dialog>` modal nativo (`shared/components/dialog`): foco atrapado, Escape, `aria-labelledby`, retorno de foco; centrado en desktop y bottom sheet en mobile. Después de elegir desaparecen "Elegir" y "Comparar"; los presupuestos quedan "Aceptado" / "No elegido".
- **Montos:** los inputs muestran `$` y separador de miles mientras se escribe; al API siempre va el número. Desde $ 1.000.000 se muestra la escala ("≈ 304 millones") y desde $ 10.000.000 un aviso de monto alto que no bloquea. Antes de enviar dice "Total estimado"; después, "Total" (el del servidor).

**"Disponible hoy" (real):** el switch lee `GET /pro/me` y guarda con `PATCH /pro/availability` (vence a medianoche, hora de Argentina). Si todavía no se sabe el valor real (sin perfil profesional o sin respuesta) no se muestra; si el guardado falla, vuelve al valor anterior. **Plan / cupo mensual:** Free presupuesta hasta 10 solicitudes por mes y PRO sin límite; lo decide el backend (ver "Tu mes, Free y PRO").

**Datos de prueba:** profesionales con `npm run fixture:test-pros` (ver arriba). Cliente: una cuenta nueva desde `/registro`, con email `@resuelve.test`. Limpieza: `fixture:test-pros -- remove` borra los profesionales, y en cascada sus invitaciones y presupuestos. Una cuenta de cliente de prueba se borra con `DELETE FROM users WHERE email = '…@resuelve.test';`, y en cascada sus solicitudes, invitaciones y presupuestos.

**Mocks.**
- **Eliminados:** `client-requests.data.ts` y `ClientRequestsStore` (Mis solicitudes mock, profesionales embebidos, presupuestos y reseñas mock), `INCOMING_REQUESTS`, el borrador de presupuesto mock, `CLIENT_SUMMARY`, contadores y actividad ficticios de solicitudes, `NEIGHBORHOODS` y los selectores de fotos simulados.
- **Restantes:** ninguno en el panel profesional.

**Deuda explícita.**
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
- **Agenda** (`/pro/agenda`, real, `professionalGuard`): trabajos simultáneos o muy cercanos se reparten en carriles (`core/utils/agenda-layout.ts`, grupos de superposición con altura mínima visible); con 2 carriles se ve hora y servicio, con 3+ solo la hora. `AgendaStore` pide una semana (lunes a domingo, hora de Argentina) a `GET /pro/appointments?from&to`. Desktop: columnas por día, hoy destacado, línea de "ahora", anterior/hoy/siguiente y un panel con el trabajo seleccionado ("Ver solicitud"). Mobile: días de la semana + lista del día (cada trabajo abre la solicitud). Confirmados en Forest, sin confirmar secundarios (borde punteado), realizados apagados; canceladas y rechazadas no aparecen. Arriba, "N trabajos pendientes de cierre" (de cualquier semana, `GET /pro/appointments/completion-due`) con **Marcar como realizado**; en la grilla dicen "Pendiente de cierre". Vacío y error reales, sin mocks.
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
- **Foto de perfil** (`avatar-editor.ts`): **Subir foto** / **Cambiar foto** / **Eliminar**, JPG/PNG/WebP ≤ 5 MB (validado antes y por el backend), cualquier proporción (se entrega cuadrada 256×256). Firma → subida directa a Cloudinary con progreso real → confirmación; error con **Reintentar**. Se ve sin F5 en el perfil, el menú de cuenta, el perfil público, resultados, "Disponibles hoy", destacados, presupuestos y el comparador; sin foto, iniciales. Una foto no es una verificación de identidad.
- Portfolio: oculto hasta tener un pipeline público de imágenes para trabajos.
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
- **Sin pantallas demo:** "Tu mes" (`/pro/estadisticas`) y Plan muestran datos y condiciones reales (ya no existe el aviso "Pantalla de demostración").
- **Área `/pro`:** TODO `/pro/**` exige sesión y `professionalProfileId` (`professionalGuard`; el backend igual responde 403 `PROFESSIONAL_PROFILE_REQUIRED`). Sin sesión → `/ingresar?returnUrl=…`; sin perfil → `/soy-profesional`. `ProShell` no monta el panel sin usuario: mientras se restaura la sesión (y en el HTML prerenderizado) solo muestra "Resuelve · Cargando tu cuenta…".
- **Pestaña duplicada / recarga que corta la respuesta del refresh:** el navegador puede quedarse con un refresh token que el backend ya rotó (sessionStorage copiado al duplicar la pestaña, o F5 antes de recibir la respuesta). El backend lo acepta como reintento dentro de `REFRESH_REUSE_GRACE_SECONDS` (ver `backend/README.md` → "Seguridad"); fuera de esa ventana sigue siendo reuso y cierra todas las sesiones.

## Backend

Ver [backend/README.md](backend/README.md): instalación, variables de entorno, migraciones, seed, tests, Swagger y los pasos para Render.

## Notificaciones in-app

Que un presupuesto nuevo o un trabajo sin cerrar no pasen desapercibidos, sin push/email y sin llenar la app de puntos rojos. Backend: `backend/README.md` → "Notificaciones in-app".

- **`NotificationsStore`** (`core/state/notifications.store.ts`): lo conecta la raíz de la app (`connect()`). Con sesión consulta `GET /me/notifications/summary` al iniciar, cada 60 s, al volver a la pestaña y después de acciones propias (aceptar, confirmar, cerrar…); si hay no leídas, trae la lista de ese modo. Sin WebSocket.
- **Badges** (texto accesible, no solo color): "Mis solicitudes" (header y "Solicitudes" en mobile) = novedades del cliente + trabajos por confirmar ("2 novedades en Mis solicitudes"). Modo profesional aparte y **por destino** (lo agrupa el backend): "Solicitudes" = novedades cuya acción está ahí (nueva solicitud, te eligieron, necesitan otro horario) y cada pestaña muestra solo las suyas ("Nuevas, 1 novedad"; "Todas" no suma aparte); "Agenda" = horarios confirmados nuevos + trabajos pendientes de cierre (el trabajo con novedad tiene un punto y "Confirmado · nuevo"; abrirlo en la Agenda marca solo esa). Entrar a `/pro/solicitudes` no marca nada: se marca al abrir la solicitud. "Modo profesional" en el header del cliente suma solo lo profesional.
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
- **Cambio de modo** (`shared/components/mode-switch`): control "Cliente | Profesional" en el header del cliente, arriba del sidebar profesional y en mobile (Home y barra superior del panel). Solo con perfil profesional; sin perfil se ofrece "Soy profesional". El pie del sidebar queda solo con la identidad.
- El logo del sidebar es solo "Resuelve": el badge "PRO" aparece únicamente en perfiles con Resuelve PRO vigente (ver "Tu mes, Free y PRO"). Nomenclatura: "Modo profesional", "Panel profesional", "Mi perfil profesional". Los títulos de pestaña del área son "… · Panel profesional".

## Tu mes, Free y PRO

- **Tu mes** (`/pro/estadisticas`, en el menú): `GET /pro/analytics/month?year&month` (sin parámetros, el mes en curso de Argentina). El backend agrega en SQL solo la actividad del profesional autenticado: solicitudes recibidas, presupuestos enviados (solicitudes distintas presupuestadas por primera vez en el mes), aceptados (por fecha de aceptación), trabajos agendados (citas confirmadas o realizadas con horario en el mes), trabajos realizados (`completed_at` en el mes), reseñas del mes (hasta 3) y el rating actual. Estados reales: cargando, error con reintento y "Tu mes recién empieza" con CTA a solicitudes. Se navega a meses anteriores hasta el del alta.
- **Free** (sirve de verdad): perfil, aparecer en resultados, recibir y ver solicitudes **sin límite**, agenda, reseñas y Tu mes básico, con **10 presupuestos por mes** (`FREE_MONTHLY_QUOTE_LIMIT`). No se limitan servicios, barrios, reseñas, agenda ni solicitudes recibidas.
  - **Cupo:** cuenta solicitudes distintas respondidas por primera vez en el mes de Argentina (editar, retirar y volver a presupuestar la misma no suma). Vuelve a 0 al cambiar de mes, sin cron. Lo valida el backend (`FREE_QUOTE_LIMIT_REACHED`), con lock para que dos envíos simultáneos con 9/10 no terminen en 11.
  - **UX** (`QuoteUsageMeter`, `FreeLimitNotice`, `QuoteLimitDialog`, textos en `core/utils/quote-usage.ts`): en `/pro/solicitudes`, "Presupuestos este mes · 7 de 10 utilizados" con un segmento por presupuesto y "Te quedan N este mes.". PRO recién aparece con 7/10 ("Presupuestá sin límite con PRO →", discreto); con 9/10 cambia el tratamiento ("Te queda 1 presupuesto este mes." + **Ver PRO**), sin bloquear ni modal; en 10/10, "Usaste tus 10 presupuestos de este mes" (sigue recibiendo solicitudes), el precio real, **Conocer PRO** y **Seguir con Free** (oculta el bloque ese mes en la pestaña). El presupuesto 10 se envía y el mismo bloque aparece debajo del éxito. El intento 11 abre "No dejes pasar esta oportunidad" (modal en desktop, bottom sheet en mobile) con la solicitud que sigue disponible (servicio y barrio, nada privado), **Quiero PRO** (`/pro/plan?quiero=1`) y **Seguir con Free**. Sin modales al entrar ni avisos antes de 7/10.
  - **Oferta 20 % el primer mes** (la decide el backend: `ProStore.introOffer()` desde `/pro/me` → `proIntroOffer`, o `details.offer` del 403): con 9/10 suma "20% OFF en tu primer mes de PRO"; en 10/10, "Tenés 20% OFF en tu primer mes." y el precio normal "después del primer mes"; en el intento 11, el bloque "Oferta · 20% OFF en tu primer mes — $15.200 el primer mes. Luego $19.000 / mes." y **Aprovechar oferta**. En `/pro/plan`, "Oferta disponible" arriba de la tarjeta PRO y en el hero, y el pedido la deja reservada ("Pediste PRO el … con 20% OFF en tu primer mes reservado"). Sin elegibilidad, ya usada o ya PRO: $19.000 / mes sin hablar de descuento. Nunca antes de 9/10, sin timers ni "solo hoy", el descuento siempre con texto (no solo color). Montos y porcentaje vienen del backend.
  - **Embudo de la oferta:** `ProStore.trackOffer` manda `SHOWN`/`CLICKED` por superficie (`REQUESTS_USAGE`, `LIMIT_MODAL`, `PLAN_PAGE`) una vez por sesión a `POST /pro/plan/offer-events`; el backend deduplica por día.
  - Un PRO que baja a Free con más de 10 en el mes conserva todo; solo se bloquean las respuestas nuevas hasta el mes siguiente o volver a PRO.
- **PRO — $19.000 / mes** (`PRO_MONTHLY_PRICE_ARS`): presupuestos sin límite, badge "PRO" en tarjetas y ficha pública (borde Forest), espacios "Destacado" en resultados y Tu mes completo.
  - **Tu mes PRO:** la pieza principal es "Tu presencia en Resuelve": apariciones (número grande, con cuántas fueron en destacados y la comparación absoluta) y el recorrido visitas → solicitudes → presupuestos → aceptados → realizados con barras y la tasa real del backend donde tiene base ("6,8 % de las apariciones"). Al lado, valor de presupuestos aceptados ("Es la suma… No representa necesariamente lo que finalmente cobraste"), tasa de aceptación, trabajos realizados e insights con reglas fijas (servicio y barrio líderes sin empate, más solicitudes o más visitas que el mes anterior, en números absolutos). Debajo, actividad por semana, rendimiento por servicio (barras) y por barrio. Nada de "ROI" ni "personas únicas".
  - **Tu mes Free:** resumen básico real, recorrido solicitud → trabajo y un solo bloque "Tu mes básico · Con PRO también podés ver…" con **Desbloquear análisis PRO**. Sin gráficos bloqueados ni blur. Se sacó el teaser "Qué barrios te generan más oportunidades" (y el "y barrios" de Plan): el análisis por barrio real sigue solo dentro de Tu mes PRO.
- **Exposición (tracking propio, anónimo):** `core/analytics/`.
  - **Aparición:** la directiva `appTrackImpression` en cada tarjeta de resultados usa `IntersectionObserver` y cuenta con ≥ 50 % visible durante ≥ 500 ms, una vez por profesional + búsqueda (servicio, barrio, "Disponible hoy") + página + pestaña. Un rerender no suma.
  - **Visita al perfil:** al cargar `/profesional/:id`, una por pestaña cada 30 min. La propia no cuenta.
  - `ExposureTracker` agrupa en tandas (cada ~2 s, hasta 50) a `POST /analytics/events` y al ocultar la página envía lo pendiente con `fetch` keepalive. La clave de sesión es aleatoria (`sessionStorage`), nunca email, teléfono ni nombre. El backend vuelve a deduplicar.
- **Contratación con Mercado Pago** (`BillingStore`, `BillingApiService`, `core/models/billing.ts`): si `GET /plans` → `pro.selfServe` es true, "Pasarme a PRO" (o "Aprovechar 20% OFF" / "Volver a PRO", según `GET /billing/pro/status`) pide `POST /billing/pro/checkout` y navega **solo** al `init_point` que devuelve el backend. Nunca se manda un precio ni se llama a Mercado Pago desde Angular. Doble click: el botón queda ocupado y el backend devuelve el mismo checkout. Errores con copy propio ("No pudimos iniciar la suscripción. Intentá nuevamente."), nunca el mensaje del proveedor.
  - **Vuelta** (`/pro/plan/resultado`, `ProPlanResultPage`): "Estamos confirmando tu suscripción" y consulta el status cada 2,5 s por hasta 30 s (el backend reconcilia con Mercado Pago). Solo con ACTIVE confirmado: "Ya sos Resuelve PRO" + **Ir a mi panel** (y **Seguir con esta oportunidad** si vino del intento 11). Sin confirmación: "Todavía estamos esperando confirmación de Mercado Pago." con **Reintentar** / **Volver al plan**. Sin polling infinito ni confetti. Al confirmar se relee `/pro/me`: badge PRO, cupo y destacados sin volver a entrar.
  - **Tu plan actual** (`ProSubscriptionPanel` en `/pro/plan`): PENDING ("Estamos esperando la confirmación de Mercado Pago." + **Continuar en Mercado Pago**), ACTIVE (estado, próximo cobro, precio —con la promo: "$15.200 el primer mes · luego $19.000 / mes"—, "El cobro y el medio de pago los administra Mercado Pago" y **Cancelar suscripción**), PAST_DUE ("Hay un problema con el último cobro. Mercado Pago está reintentando el cobro. Mientras tanto mantenemos tu acceso PRO…", nunca "moroso"), PAUSED y CANCELLED ("Seguís teniendo PRO hasta el …"; después Free con **Volver a PRO**). Cancelar pide confirmación sin dark patterns ("No volveremos a cobrarte. Tu perfil, reseñas y datos no se eliminan." · **Volver** / **Cancelar suscripción**).
  - **Intento 11:** con billing, el modal del cupo va directo al checkout guardando la solicitud (`returnTo`) para volver a presupuestarla apenas se activa.
  - Sin billing (`selfServe: false`) todo sigue como antes: "Quiero PRO" registra el pedido y PRO se activa a mano.
- **Sigue fuera:** prueba gratis, varios planes, anual, facturas propias, cambio de tarjeta dentro de Resuelve, plantillas de presupuesto (flag apagado), portfolio ampliado, push y email PRO. Nada de eso se muestra como disponible.
- **Entitlements:** la UI pregunta `ProStore.entitlements()` (`canSendUnlimitedQuotes`, `canBeFeatured`, `canUseAdvancedAnalytics`, `canSeeExposureAnalytics`, `canUseQuoteTemplates`) que manda `/pro/me`, nunca `tier === 'PRO'`; el único lugar que mira el tier es `ProStore.hasPro` (badge = suscripción vigente). El cupo viene en `/pro/me` → `quoteUsage { period, used, limit, remaining }` (`null` = sin límite). `featured { eligible, reason }` dice si hoy puede ocupar destacados (lo decide el backend) y `proInterestAt` si pidió PRO. Tu mes usa lo que devuelve el backend (`advanced` y `exposure` en `null` para Free).
- **Página Plan** (`/pro/plan`), para vender sin mentir: hero ("Aprovechá todas las oportunidades.", `$19.000 / mes` de `GET /plans` —si falla no se muestra precio— y "Lo que suma PRO" en tres líneas), después 01 Respondé sin límite (Free 10 / mes vs. PRO sin límite), 02 Entendé qué te genera Resuelve (maqueta de Tu mes rotulada **"Ejemplo"**: números ilustrativos, nunca presentados como del usuario), 03 Destacate cuando te buscan (tu perfil REAL como se vería en un espacio destacado, sin rating inventado), tarjetas Free/PRO y comparación agrupada ("Trabajar con Resuelve" / "Crecer en Resuelve", tabla de 3 columnas que entra en 390 px), prueba de valor honesta ("Resuelve no garantiza trabajos") y cierre "No dejes oportunidades sin responder.".
  - **"Quiero PRO" sin checkout** (solo con billing apagado): abre un diálogo que explica que la contratación online se está habilitando y que PRO se activa a mano; **Registrar mi pedido** hace `POST /pro/plan/interest` (idempotente: guarda la primera fecha, no cambia el plan ni cobra; con oferta elegible manda solo `offerCode` y la reserva). Después: "Pediste PRO el 26 de septiembre". Los pedidos se ven en `npm run plan:set -- list`.
  - Con billing, la confirmación vive en `/pro/plan/resultado` (ver "Contratación con Mercado Pago").
- **Dashboard:** PRO muestra el badge junto al saludo y "Perfil activo · Puede aparecer en espacios destacados cuando te buscan" solo si `featured.eligible`; la tarjeta "Tu presencia en Resuelve" (apariciones, visitas, solicitudes, una sola visualización —solicitudes por semana— y **Ver rendimiento**) y Tu mes con el valor aceptado. Free ve "Perfil público" con su reputación real; el dashboard no tiene upsell.
- **Mi perfil profesional:** PRO elegible → "Perfil destacado activo" + **Ver cómo se muestra** (`/pro/plan#destacado`); PRO que no cumple → "Todavía no aparecés en destacados" y qué falta (pausado, sin servicio habilitado, sin barrios). Free → "Hacé que tu perfil tenga más presencia." + **Ver PRO**.
- **Upsells:** solo tres lugares: el cupo (desde 7/10), Tu mes Free y Mi perfil profesional. La oferta de bienvenida, solo en el cupo (desde 9/10), el diálogo del intento 11 y la página Plan (nunca en Agenda, Perfil, Home ni el dashboard). Además la página Plan y el enlace "Conocer PRO" del inicio para profesionales.
- **Resultados:** un espacio destacado lleva el rótulo "Destacado · Espacio promocionado de Resuelve PRO", borde Forest y una barra lateral; un PRO orgánico solo lleva el badge "PRO".
- **Badges:** "PRO" = suscripción vigente; "Destacado" = espacio promocionado; "Matrícula verificada" e "Identidad verificada" siguen siendo señales independientes.
