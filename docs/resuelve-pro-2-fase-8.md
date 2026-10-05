# Resuelve PRO 2.0 · Fase 8 — Hardening y lanzamiento

> **FASE 8 LISTA PARA LANZAMIENTO: NO TODAVÍA.**
> Lo que se puede verificar desde el código y un entorno local está hecho y probado. Faltan ítems del
> checklist que solo se pueden cerrar con producción o dispositivos reales (ver "Lo que falta para decir SÍ").
> No se agregaron features. No hay Fase 9: lanzar, medir y decidir con datos.

## Qué se hizo en esta fase

| Bloque | Resultado |
| --- | --- |
| 8A/8B Seguridad y ownership | Auditados `jobs`, `requests`, `quotes`, `notifications`, `favorites`. Ya filtraban por dueño; ahora hay tests e2e que lo fijan (`test/phase8-hardening.e2e-spec.ts`): otro profesional → 404 y un cliente → 403 en **cada** acción de un trabajo ajeno; cliente ajeno → 404 en solicitud, presupuestos y cancelación; notas privadas nunca llegan al cliente. |
| 8C Rate limiting | Hueco encontrado: crear solicitud, presupuesto y reseña, invitar, aceptar, favoritos y "Quiero PRO" solo tenían el límite global (120/min). Nuevos `THROTTLE_CREATE_LIMIT` (12/min) y `THROTTLE_WRITE_LIMIT` (30/min) por IP (`src/common/throttle.ts`, con spec). Login/registro/códigos/subidas/billing/admin ya tenían el suyo. |
| 8D/8E Errores y logs | Cada pedido tiene `requestId` (header `X-Request-Id`, cuerpo del error y logs). Los errores no filtran SQL ni stack (testeado). Los logs ya censuraban `authorization`, cookies, `password` y `refreshToken` y no loguean headers ni bodies. |
| 8O Healthchecks | `/health` (readiness: API + base) y nuevo `/health/live` (solo proceso). |
| 8F Performance frontend | El shell profesional pasó a lazy (−17 kB raw del bundle inicial). Ver "Performance" más abajo: el budget sigue avisando, no se subió. |
| 8G/8-SEO | Ver README → "SEO técnico". 404 real, `noindex` por defecto, sitemap y robots dinámicos, JSON-LD y política de perfiles pausados. |
| 8M Base de datos | Índices auditados. Faltaba `jobs(client_id, status)` (lo usan Mis profesionales, historial, recontratación): migración `1792900000000-Phase8JobsClientIndex` (apply → revert → apply probado). Solo agrega un índice. |
| 8L Deuda | Barrido de `TODO/FIXME/console.log/debugger/qwe/lorem/mock`: no queda nada en la UI. Quedan solo los dos `TODO` deliberados de email legal (decisión vigente: sin email visible) y los `console.log` de CLIs/seeds. Test de `seed:catalog` arreglado (hardcodeaba 5 barrios; ahora deriva del catálogo). |
| 8-Data hygiene | `npm run launch:audit` (solo lectura): perfiles/cuentas de QA, reseñas basura, solicitudes de prueba, perfiles sin servicio publicable y **oferta real por servicio**. |
| Free 5 total | Sin referencias mensuales en la UI ni en las reglas (los "/ mes" de la UI son el precio de PRO). `FREE_MONTHLY_QUOTE_LIMIT` quedó solo como compatibilidad, marcada DEPRECADA en `.env.example`. |
| Emails | Fuera de alcance por decisión: Render gratuito no permite SMTP. El código está listo; se activa con `EMAIL_VERIFICATION_ENABLED` + SMTP cuando se quiera. Documentado como post-lanzamiento. |

### Hallazgos de seguridad y riesgos que quedan

- **Refresh token en `sessionStorage`** (no HttpOnly). Sigue siendo el TODO conocido: se resuelve con dominios propios same-site (`resuelve.com.ar` + `api.resuelve.com.ar`) y cookie `HttpOnly + Secure`. Mitigaciones actuales: access token solo en memoria, rotación con detección de reuso.
- **CSP en el frontend**: no se fuerza. Angular inyecta estilos críticos y un `onload` en línea y el script anti-flash del tema; forzar una CSP sin probarla en un navegador real contra producción puede dejar la app en blanco. Va como `Content-Security-Policy-Report-Only` + endpoint de reportes, o con nonces, post-lanzamiento. La API sí tiene CSP estricta (Helmet).
- El throttling es por IP (`trust proxy 1`). Varias personas detrás de la misma IP (NAT, oficina) comparten cupo; los límites son holgados para uso normal.
- Subida de archivos: ya validan MIME, tamaño, cantidad y ownership (avatar, trabajos, matrícula) con tests propios de fases previas.

## Performance

```text
bundle inicial (build de producción): 563 kB raw / 143 kB transferidos (antes 580 / 146)
  - @angular/core 222 kB + router 100 kB + common 40 kB + rxjs 23 kB = el 80 % del chunk principal
budget "initial": 520 kB → ADVERTENCIA preexistente (+43 kB). No se subió el budget para ocultarla.
LCP / CLS / INP: NO medidos. Requieren staging/producción (Lighthouse/PageSpeed sobre la URL real).
backend: queries revisadas (sin N+1 en lo auditado); la búsqueda pública trae todos los ids activos
         y pagina en memoria (aceptable para una ciudad; revisar si pasan de ~2.000 perfiles).
```

## Accesibilidad / responsive (verificado local, Chromium)

Playwright + axe-core (impacto serio/crítico) sobre `/`, `/servicios`, `/urgencias`, `/terminos`, `/privacidad`,
una ruta inexistente (404), `/p/:slug` y `/ingresar`, a **1440, 1024 y 390 px, en claro y oscuro**:
0 violaciones, 0 scroll horizontal, `noindex` y canonical correctos por ruta. No se corrieron Firefox/WebKit
(no hay en este entorno), ni 430/768/1280/1920, ni los flujos autenticados (agenda, plan, analytics): falta QA manual.

## Deploy (en este orden)

Esta fase incluye **una migración** (solo agrega un índice) y un endpoint nuevo (`/professionals/sitemap`) que usa el frontend.

1. **Backup** de la base de Render (Dashboard → Postgres → Backups → crear uno manual) y anotar el commit actual de `main`.
2. **Backend** (Render): deploy de este commit. El Pre-Deploy Command corre `npm run migration:run:prod`.
3. **Smoke backend**: `GET /api/v1/health` → `{"status":"ok","database":"up"}`; `GET /api/v1/health/live` → 200; `GET /api/v1/professionals/sitemap` → lista de `{slug, updatedAt}`.
4. **Frontend** (Vercel): deploy del mismo commit. Verificar `/sitemap.xml`, `/robots.txt`, una ruta inexistente (404 con "Esta página no existe") y `/p/<slug>` con `curl -A WhatsApp`.
5. **Smoke completo** (abajo).

## Rollback

- **Frontend**: Vercel → Deployments → promover el deployment anterior (no toca la base).
- **Backend**: Render → Manual Deploy del commit anterior. El índice nuevo es inofensivo para el código viejo; no hace falta revertir la migración.
- **Migración** (solo si hiciera falta): `npm run migration:revert` ejecuta el `DROP INDEX IF EXISTS`. Cambia solo un índice; no hay pérdida de datos.
- **Variables**: las nuevas (`THROTTLE_CREATE_LIMIT`, `THROTTLE_WRITE_LIMIT`) son opcionales; sin ellas valen 12 y 30. Para aflojar un límite sin redeploy de código, subir la variable.

## Checklist de entorno de producción

**Render (backend)** — `NODE_ENV=production`, `DATABASE_URL` (interna) + `DATABASE_SSL` según la URL, `JWT_ACCESS_SECRET` ≠ `JWT_REFRESH_SECRET`, `FRONTEND_URL` (dominio de Vercel y el definitivo, separados por coma, sin `*`), `FREE_QUOTE_LIMIT=5` (y **borrar** `FREE_MONTHLY_QUOTE_LIMIT` si existe), `PRO_MONTHLY_PRICE_ARS=15000`, `REFERRALS_ENABLED=true`, `REFERRAL_REWARDS_ENABLED=true`, `REFERRAL_REWARD_DAYS=15`, `LOCATION_PROVIDER=none` (mapas fuera), Cloudinary (`npm run cloudinary:check`), Mercado Pago (`BILLING_PROVIDER=mercadopago`, `MP_ENV=prod`, `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`, `MP_BACK_URL`) solo cuando se decida cobrar, `EMAIL_VERIFICATION_ENABLED=false`, health check path `/api/v1/health`.

**Vercel (frontend)** — `PUBLIC_APP_URL` (origen sin slash final, cuando exista el dominio definitivo), `PUBLIC_API_URL` solo si la API cambia de URL, `environment.ts` con `apiUrl` correcto (y `publicAppUrl` cuando haya dominio). Nunca poner secretos en el repo.

## Smoke test post-deploy

login → inicio → buscar → crear solicitud → recibir y aceptar presupuesto → trabajo/agenda → completar → reseña → perfil público (`/p/slug`) + QR + compartir → Mi plan → notificaciones → referido (registro con `?ref=`).
Con Mercado Pago real: probar primero con `MP_ENV=test`.

## Monitoreo

- **Primeras 24 h:** 5xx, errores de auth (401 en bucle), errores de migración, webhooks de MP (firma/idempotencia), errores de notificaciones, conexiones a la base, latencia (cold start de Render).
- **Primeros 7 días:** `npm run funnel:report` (embudo del profesional), registros, solicitudes, presupuestos, aceptación, conversión a PRO, referidos, recontratación, reseñas.

## Soporte: cómo seguir un caso

1. Pedirle a la persona el **código de soporte** (`requestId` del error, o la hora aproximada) — es el mismo que el header `X-Request-Id` y que cada línea de log del pedido (`req.id`).
2. Buscar ese id en los logs de Render. Los logs tienen método, ruta y status, no cuerpos ni datos personales.
3. Con el `userId` / `requestId` / `jobId` / `quoteId` (los ids de la URL de la app) mirar en la base: `service_requests`, `request_invitations`, `quotes`, `jobs` + `job_events` (línea de tiempo del trabajo), `notifications` (por `user_id`, con `dedupe_key`), `billing_subscriptions` y `billing_payments` (estado de cobro), `referrals`.
4. Billing: `npm run billing:reconcile` reconcilia con Mercado Pago. Plan manual: `npm run plan:set`. Matrículas: `/admin/matriculas`.
5. Nada de esto requiere un admin nuevo.

## Lo que falta para decir "SÍ" (no se puede cerrar desde acá)

- [ ] **Medir LCP/CLS/INP** en producción/staging (hoy no hay números reales).
- [ ] **Dispositivos reales** (Android/iPhone): Web Share, QR, teclado, date/time, sticky UI; **Firefox, WebKit y Edge**.
- [ ] **Anchos 430/768/1280/1920** y los flujos autenticados (agenda, plan, analytics, notificaciones) en claro/oscuro con axe.
- [ ] **Auditoría real de variables** en Render y Vercel (este entorno no las ve; usar el checklist de arriba).
- [ ] **Limpiar datos de QA en producción** con `npm run launch:audit` y decidir qué se pausa/borra (con backup).
- [ ] **QA E2E de punta a punta en staging** de cliente, profesional, PRO (checkout MP en `test`), referido y notificaciones. El backend tiene suites e2e por cada flujo (todas verdes), pero no hay una corrida de navegador de extremo a extremo.
- [ ] **Dominio `resuelve.com.ar`**: ya está en `environment.ts` (`publicAppUrl`). Antes de deployar: que el dominio apunte a Vercel con HTTPS, agregarlo a `FRONTEND_URL` en Render (si no, CORS bloquea la app), poner `PUBLIC_APP_URL=https://resuelve.com.ar` en Vercel y dar de alta el sitio en Google Search Console (enviar `/sitemap.xml`).
- [ ] **Oferta real**: hoy no hay oferta en producción. No promocionar ninguna categoría hasta que `npm run launch:audit` muestre profesionales reales por servicio.

## Pendientes post-lanzamiento (no críticos)

- Emails transaccionales (te eligieron, nuevo presupuesto, trabajo próximo, reset de contraseña) cuando haya SMTP.
- Cookie `HttpOnly` para el refresh token (requiere dominios same-site).
- CSP del frontend (primero en modo reporte).
- Imágenes de Cloudinary con `srcset`/`sizes` en las grillas (hoy ya se entregan acotadas y con `q_auto,f_auto`).
- Consolidar componentes parecidos (cards PRO, badges de estado) si la duplicación molesta en la práctica; no se tocó para no arriesgar regresiones visuales en esta fase.
- Eliminar `FREE_MONTHLY_QUOTE_LIMIT` del código.
- Paginar en SQL la búsqueda pública si el catálogo de profesionales crece mucho.

## Git

Commit y push solo a la rama de la sesión (`claude/wizardly-newton-s62f9g`), porque el entorno de la sesión es efímero. No hay PR, merge ni deploy.
