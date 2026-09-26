# Resuelve

Marketplace de servicios locales en Tandil. Frontend Angular 22 en `src/`, backend NestJS 11 + TypeORM + Postgres en `backend/`.
El detalle técnico está en `README.md` y `backend/README.md`: leelos antes de cambiar algo.

## Estado actual

- Auth real: access token solo en memoria, refresh token en sessionStorage (TODO: cookie HttpOnly).
- Catálogo, profesionales, requests, invitations, quotes, aceptación de presupuesto y privacidad ganador/perdedor: reales.
- Núcleo profesional (reglas en `backend/src/professionals/professional-rules.ts`, única fuente):
  - cobertura por barrios o "Todo Tandil" (`coversEntireCity`, no es una zona);
  - perfil `ACTIVE` / `PAUSED`;
  - "Disponible hoy" vence a medianoche de Argentina;
  - matrícula por servicio según `requiresLicense` (nunca por nombre), verificada por NÚMERO en el registro oficial; el documento es opcional y privado (Cloudinary).
- Panel admin `/admin/matriculas`: `users.is_admin`, `AdminGuard` responde 404 a quien no es admin. Se otorga solo con `npm run admin:grant -- <email>`. CLI de respaldo: `npm run verification:review`.
- Siguen siendo demo: Agenda, "Tu mes" y Plan.

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
