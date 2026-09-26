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
- Cierre del trabajo: terminado el horario confirmado, el cliente **o** el elegido lo marca realizado (`POST /requests/:id/complete`, guarda `completed_by`) o piden reprogramar. El tiempo NUNCA completa nada: "pendiente de cierre" (`isCompletionDue`) se deriva al consultar, sin cron.
- Notificaciones in-app reales (`notifications`, `notify()` en la transacción de la acción, `dedupe_key` único, nunca a quien actúa): presupuesto nuevo, horario propuesto/reprogramado, elegido, confirmado/rechazado. Polling de 60 s en `NotificationsStore`, badges por modo (cliente/profesional no se mezclan). Sin push/email/WebSocket (`README.md` → "Notificaciones in-app").
- Elegibilidad al invitar (`requestIneligibility`): perfil activo + servicio/matrícula + barrio o "Todo Tandil"; el presupuesto la revalida sin cobertura.
- Núcleo profesional (reglas en `backend/src/professionals/professional-rules.ts`, única fuente):
  - cobertura por barrios o "Todo Tandil" (`coversEntireCity`, no es una zona);
  - perfil `ACTIVE` / `PAUSED`;
  - "Disponible hoy" vence a medianoche de Argentina;
  - matrícula por servicio según `requiresLicense` (nunca por nombre), verificada por NÚMERO en el registro oficial; el documento es opcional y privado (Cloudinary).
- Panel admin `/admin/matriculas`: `users.is_admin`, `AdminGuard` responde 404 a quien no es admin. Se otorga solo con `npm run admin:grant -- <email>`. CLI de respaldo: `npm run verification:review`.
- Reseñas y reputación reales: el cliente reseña un trabajo `COMPLETED` (una por trabajo, regla `reviewBlocker`); rating/cantidad en perfil, resultados y presupuestos (`README.md` → "Reseñas y reputación").
- Login: `returnUrl` seguro > `/pro/dashboard` si tiene perfil profesional > `/perfil`.
- "Tu mes" real (`GET /pro/analytics/month`, SQL por profesional, mes de Argentina) y Free/PRO real (`backend/README.md` → "Planes, entitlements y destacados"):
  - plan efectivo con `plan_expires_at`; la UI pregunta por entitlements, nunca por el tier;
  - PRO solo por `npm run plan:set` (sin endpoint); badge "PRO" = suscripción vigente, distinto de matrícula;
  - "Destacado" en búsqueda: solo PRO que cumple todas las reglas, rotulado, rotando y sin enterrar a Free;
  - límite Free, slots y precio configurables por env (default: sin límite, precio a confirmar). Sin billing ni trial.

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
