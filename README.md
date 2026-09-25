# Resuelve

Marketplace local de servicios profesionales (Tandil).

```text
resuelve/
  src/        frontend Angular 22 (Tailwind, signals). Datos mock en src/app/core/data
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
- Siguen siendo mock: solicitudes, presupuestos, agenda, reseñas y el área pro. También algunos textos de apoyo por servicio (trabajos típicos y título por defecto).
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
- **Pedido:** "Solicitar presupuesto" guarda en `RequestStore` una referencia mínima real `{ id, displayName, firstName, avatarUrl }` más el `serviceId` real. Todavía **no** se envía nada al backend (siguiente vertical: solicitudes → invitaciones → presupuestos).

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
- **Siguen mock:** "Mis solicitudes" y el área `/pro`. Cada solicitud mock guarda su propia foto mínima de profesionales de ejemplo (`client-requests.data.ts`), que no enlazan a perfiles. El área `/pro` usa una identidad de ejemplo y muestra un aviso de demostración; "Ver perfil público" solo aparece si el usuario tiene un `professionalProfileId` real.

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

- **Restaurar sesión (F5):** al arrancar en el navegador, si hay un refresh token en sessionStorage se llama `/auth/refresh`, que lo rota, y después `/auth/me`. Mientras tanto `initializing = true`: el header muestra un lugar reservado en vez de "Ingresar" y las pantallas personales muestran "Cargando tu sesión…". Si el refresh falla, se limpia todo y se sigue como invitado. En SSR/prerender no se toca sessionStorage ni se llama al backend.
- **Interceptor (`core/auth/auth.interceptor.ts`):** agrega `Authorization: Bearer` solo a requests a `API_URL` y solo con sesión. Ante un 401 hace un único refresh, compartido por todas las requests concurrentes (`AuthStore.refresh()` reutiliza el que está en vuelo), y reintenta la request original una sola vez. Nunca actúa sobre login, register, refresh ni logout (`SKIP_AUTH`), así que no puede entrar en loop. Si el refresh falla, cierra la sesión local, muestra un único aviso y manda a `/ingresar` solo si la pantalla actual es personal (`data.requiresAuth`).
- **Rutas:** `/ingresar` y `/registro` (Reactive Forms, validaciones alineadas con el DTO y el backend como autoridad). `authGuard` protege `/perfil` y `/mis-solicitudes`, que todavía usa mocks pero es contenido personal. Home, `/servicios`, `/profesionales` y los perfiles públicos no se protegen.
- **`returnUrl`:** se aceptan solo rutas internas (`safeReturnUrl`). Se rechazan `https://…`, `//host`, `\`, esquemas como `javascript:`, caracteres de control y las propias rutas de auth.
- **Enviar solicitud sin sesión:** el pedido queda en `RequestStore` (memoria). Se va a `/ingresar?returnUrl=/presupuesto` y, después de ingresar o registrarse, se vuelve con el pedido intacto. Recargar la página en el login sí lo pierde: los borradores no se persisten.
- **Registro:** el backend devuelve tokens, así que la sesión queda iniciada.
- **Errores:** los mensajes salen de `status` y `code`, nunca del `message` de Nest. 401 → "Email o contraseña incorrectos." (no revela si el email existe). 429 → "Demasiados intentos…", sin reintento automático. Red o 5xx → "No pudimos iniciar sesión…". 409 `EMAIL_ALREADY_REGISTERED` → error en el campo email. No hay timeouts: Render Free puede tardar en despertar, y a los 5 s se avisa que el servidor está despertando.
- **Logout:** es idempotente. Limpia local primero y después revoca en `/auth/logout`; aunque el backend falle, la sesión local queda cerrada.
- **Perfil:** nombre, apellido, email, teléfono y avatar salen de `/auth/me`. El backend todavía no tiene endpoint de edición, así que los datos se muestran pero no se editan.
- **Mocks eliminados:** `CLIENT_USER` (la identidad mock del cliente en header y perfil).
- **Siguen mock:** profesionales, solicitudes, presupuestos, agenda, reseñas, estadísticas y el área `/pro`.
- **Área `/pro`:** no tiene protección real. La autorización por `ProfessionalProfile` llega con el onboarding y la integración del área pro. `/auth/me` ya trae `professionalProfileId`; por ahora solo se usa para no mostrar el aviso "Modo profesional · N solicitudes" a quien no tiene perfil profesional.
- **Pestaña duplicada:** el navegador copia sessionStorage al duplicar la pestaña. Las dos pestañas comparten el refresh token, y cuando una lo rota, el backend detecta el reuso en la otra y cierra todas las sesiones. Es otra razón para migrar a cookie HttpOnly.

## Backend

Ver [backend/README.md](backend/README.md): instalación, variables de entorno, migraciones, seed, tests, Swagger y los pasos para Render.
