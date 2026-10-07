# RESUELVE PRO 2.0 — FASE 6

## Estado

**FASE 6 LISTA PARA QA: SÍ.** Implementada y validada localmente. No se publicó ni se avanzó a Fase 7.

## Perfil público

- **Ruta:** `/p/:slug`. Reutiliza `ProfessionalProfilePage`, el presenter público y los componentes actuales; conserva `/profesional/:id`.
- **Slug:** lowercase, URL-safe, único y persistido. Normaliza tildes y agrega `-2`, `-3`, etc. ante colisiones. Cambiar el nombre no lo modifica. La migración asigna identidad a perfiles existentes y un trigger cubre los nuevos.
- **Hero:** conserva la composición de persona, oficio, disponibilidad, reputación y trabajos reales. Compartir es una acción secundaria junto al presupuesto; no se creó otra ficha o landing.
- **CTA:** inicia `TARGETED`, conservando el destinatario. Una visita nueva comienza sin servicio ni pedido inventados; un pedido que ya tiene contexto explícito conserva su servicio y borrador. Los cupos siguen los del sistema existente.
- **Login:** el visitante continúa con el mismo profesional y origen después de login, registro y recarga. El borrador vacío vuelve al paso de servicio, no a una revisión con opciones precargadas.
- **Pausado:** la URL por slug sigue funcionando con el aviso «Este profesional no está recibiendo nuevas solicitudes por ahora». No ofrece presupuesto; sus reseñas siguen disponibles. Los endpoints legacy mantienen su contrato de visibilidad.
- **Privacidad:** el contrato público no incorpora teléfono, email, dirección exacta, coordenadas, notas privadas, código de referido ni fechas del bonus.
- **SEO:** título, descripción, canonical sin `src` y Open Graph con información pública real. Se mantiene el build Angular estático. La función `api/public-profile.ts` devuelve el documento Angular con metadata para los crawlers que no ejecutan JavaScript. No carga analytics privados ni reenvía cookies o autorización. Perfil inexistente: 404/noindex; API no disponible: 503/noindex.

## Compartir

- **Web Share:** preferido cuando existe; cancelar no muestra un error. Validado el contrato de la API con un stub de navegador; la hoja nativa de cada sistema operativo queda para QA en dispositivos reales.
- **WhatsApp:** enlace explícito con texto y URL pública. No hay envío automático.
- **Copiar:** Clipboard API con confirmación; si falla, el enlace queda seleccionable y la interfaz indica cómo copiarlo.
- **QR:** `/p/:slug?src=qr`, contraste alto y margen de cuatro módulos. Se puede descargar PNG y siempre hay una URL textual alternativa. Contiene solo el enlace público.
- **Mi Perfil:** bloque compacto para Free y PRO con compartir, copiar y QR. Los diálogos reutilizan `Dialog`, su foco modal, Escape, retorno de foco, motion y reduced motion.
- **Dependencia:** `qrcode-generator@2.0.4`, importación dinámica únicamente al generar un QR. No se incorporó una biblioteca de animaciones ni nuevas redes sociales.

## Atribución

| Entrada | Fuente persistida |
| --- | --- |
| Marketplace sin contexto externo | `MARKETPLACE` |
| Perfil público | `PUBLIC_PROFILE` |
| Enlace con `src=qr` | `PROFILE_QR` |
| Enlace generado para compartir, `src=share` | `PROFILE_SHARE` |
| Registro por invitación | `REFERRAL` |

Se guarda `acquisition_source` en la solicitud. Para `TARGETED`, las invitaciones conservan perfil/QR/share/referral sin perder las reglas de entrega y cupo. El origen sobrevive al borrador y a la autenticación; una referencia de sesión con fuente y timestamp permite conservarlo al navegar durante 12 horas. No incluye identificadores personales del visitante, IP ni GPS. `PRO_ATTRIBUTION=false` mantiene el escape existente hacia marketplace.

**Tu mes:** suma visitas registradas al perfil y solicitudes desde perfil, QR y compartir, filtradas por mes en horario de Argentina y protegidas por el entitlement de analytics PRO. Se reutilizan eventos reales; las visitas no se presentan como personas únicas ni se inventa ROI.

## Referidos

> **Reemplazado:** la activación ya no pide presupuesto. Regla vigente en `docs/referral-progress.md` (premio al crear el perfil, tope de 3 para quien invita, festejo).

- **Código:** estable y único, `PRO-` + UUID sin guiones. Se eligió una identidad independiente del nombre y sin colisiones aleatorias; no es editable ni contiene teléfono/email.
- **Enlace:** `/registro/profesional?ref=…`, usando el registro y onboarding existentes.
- **Registro:** vincula la cuenta nueva con un solo referente. Con verificación de email, conserva el código en el registro pendiente y crea la relación al verificar.
- **Activación:** perfil activo con headline, servicio activo ofrecido públicamente —matrícula válida cuando corresponda—, cobertura y un presupuesto real enviado a un cliente que no sea el propio profesional ni su referente. Registrarse o crear un perfil incompleto no otorga recompensa.
- **Reward:** 15 días de PRO para ambos, configurables de 1 a 30. Se aplican dentro de la transacción de presupuesto, con bloqueo de filas y una entrada única por referido/profesional. Reintentos y concurrencia no duplican días.
- **Estados:** `REGISTERED`, `ACTIVATED`, `REWARDED`, `INVALID`. El panel en Mi Plan muestra primer nombre e inicial, estado y días reales. Los contadores cubren todos los registros; el listado muestra los últimos 100 e indica ese límite cuando corresponde.
- **Antifraude:** código inexistente y self-referral bloqueados; una cuenta existente no dispone de un endpoint para agregar un código después. La restricción por usuario impide múltiples referentes y el ledger impide rewards duplicados.
- **Flags:** `REFERRALS_ENABLED`, `REFERRAL_REWARDS_ENABLED`, `REFERRAL_REWARD_DAYS`. Con rewards apagados puede quedar `ACTIVATED` sin aplicar bonus. Al habilitarlos, una nueva acción que evalúe la activación puede otorgar la recompensa pendiente una sola vez; no se añadió un proceso de cobro o barrido automático.

## Billing

`bonus_pro_until` es independiente de `billing_pro_until`, la suscripción y el PRO manual. El resolver da prioridad al manual vigente, después al billing vigente y después al bonus. `BONUS_PRO` habilita las capacidades PRO y caduca automáticamente al leer el plan.

Al recompensar se suman días sobre la mayor fecha entre ahora y las fechas de acceso vigentes. Eso puede extender el acceso efectivo después del período pago sin cambiar fechas, montos, renovaciones, cancelaciones o webhooks de Mercado Pago. **El bonus no pausa ni descuenta cobros de una suscripción activa.** El checkout continúa disponible para quien tenga únicamente bonus; se mantienen las restricciones de suscripciones abiertas y PRO manual.

Mi Plan explica que el bonus no crea cobros ni modifica Mercado Pago. Se conservaron trial de primer éxito, estados `CANCELLED`/`PAST_DUE`, reconciliación y reglas de cuotas.

## DB / migraciones

Única migración nueva: `backend/src/database/migrations/1792500000000-Phase6Acquisition.ts`.

| Objeto | Cambio |
| --- | --- |
| `professional_profiles` | `slug varchar(190)`, `referral_code varchar(40)`, `bonus_pro_until timestamptz` |
| `pending_registrations` | `referral_code varchar(40)` |
| `service_requests` | `acquisition_source varchar(32) NOT NULL DEFAULT 'MARKETPLACE'` |
| Índices | `uq_professional_slug`, `uq_professional_referral_code`, `idx_referrals_referrer` |
| Identidad | función `resuelve_public_identity`, trigger `trg_public_identity`, backfill y NOT NULL |
| `referrals` | relación única por usuario referido, estados y timestamps; FK a perfil referente y usuario |
| `referral_rewards` | días, fecha de concesión, acceso hasta; UNIQUE por referido/profesional |

Se validó **run → revert → run** sobre datos locales existentes. No se ejecutó contra producción. La reversión elimina los objetos de esta fase, por lo que no debe usarse para conservar datos de adquisición ya generados.

## Tests

| Validación | Resultado |
| --- | --- |
| Backend unit | 31 suites verdes, incluidas las pruebas de bonus y prioridades |
| Backend e2e | 20 suites verdes sobre PostgreSQL local; incluyen migración, slugs, pausa, TARGETED, fuentes, registro verificado, reward, flags, concurrencia y antifraude |
| Total backend | **501 tests / 51 suites, sin skips** |
| Frontend | **525 tests / 37 archivos** |
| Metadata pública | **6 tests**, incluyendo escape HTML, privacidad, HEAD, errores y canonical |
| Backend lint / TypeScript / build | Verdes |
| Frontend production build / TypeScript | Verde, 24 rutas estáticas |
| TypeScript del adaptador Vercel | Verde, comprobación separada |
| `git diff --check` | Verde |

Comandos ejecutados: `npm test -- --watch=false`, `npm run build`, `npm run test:metadata`; en `backend`, `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`, con `TEST_DATABASE_URL` explícito apuntando a la base local de test.

La regresión detectó un error previo de integración entre appointments y jobs: TypeORM devolvía una tupla para UPDATE/RETURNING y se intentaba crear un evento con `job_id` vacío. Se corrigió mediante CTE/SELECT, sin cambiar transiciones. También se sincronizó la fecha del job en un fixture de analytics que movía solamente el appointment al pasado. Se conservaron las expectativas de esos tests.

## Responsive

| Ancho | Resultado |
| --- | --- |
| 390 px | Verde, light/dark |
| 768 px | Verde, light/dark |
| 1024 px | Verde, light/dark |
| 1280 px | Verde, light/dark |
| 1440 px | Verde, light/dark |
| 1920 px | Verde, light/dark |

QA con Playwright y respuestas controladas: **72 comprobaciones de pantalla** entre perfil público, QR, Mi Perfil, Mi Plan/referidos, Tu mes y registro invitado. Share sheet revisada adicionalmente en cada ancho y tema. Sin overflow horizontal ni excepciones de JavaScript en las páginas recorridas.

Se verificó copiar el enlace, decodificar cada QR exportado con un lector independiente, Escape, perfil pausado, metadata y visitante → login → recarga → mismo profesional TARGETED y fuente QR. Axe no encontró infracciones de los conjuntos WCAG A/AA revisados **dentro de los diálogos de compartir y QR**; no constituye una certificación de toda la aplicación.

## Bundle

| Medición | Initial raw |
| --- | --- |
| Antes | 549,93 kB |
| Después | **550,56 kB** |
| Diferencia | +0,63 kB, aproximadamente 0,11 % |

Transferencia inicial estimada: 138,91 kB. El generador QR queda en un chunk lazy de aproximadamente 20,83 kB raw. Se reutilizan avatar, portfolio y carga de imágenes existentes; no se agregaron assets decorativos ni peticiones de analytics privados al perfil público.

Permanece el warning previo por superar el presupuesto inicial de 520 kB. No se aumentó el presupuesto para ocultarlo. También siguen los avisos previos de ts-jest y `scrollTo` de jsdom.

## Riesgos restantes y publicación

1. Aplicar primero la migración y publicar el backend actualizado; después el frontend. El frontend nuevo necesita los endpoints y campos nuevos.
2. Verificar el preview real de WhatsApp en una URL de staging luego de un deploy autorizado: localmente se probó el documento que sirve el adaptador, pero no su empaquetado en la infraestructura Vercel ni la caché de WhatsApp. La configuración quedó en el repositorio, sin tocar el panel de Vercel.
3. Validar Web Share nativo y escaneo con cámara en dispositivos reales. El QR PNG sí se decodificó automáticamente y el fallback se probó en navegador.
4. Si se fija un dominio canónico, mantener alineados `environment.publicAppUrl` y `PUBLIC_APP_URL`; si se cambia la API de producción, actualizar la configuración existente o `PUBLIC_API_URL`. No se agregaron hosts de producción dentro de componentes.
5. El programa usa controles básicos verificables. No agrega evaluación antifraude bancaria ni promete que una invitación registrada obtenga recompensa sin activación.

## Git

- **NO push.**
- **NO merge.**
- **NO PR.**
- **NO deploy.**

Los cambios quedan en el workspace para revisión. Se conservó el archivo `debug.log` que ya existía. No se añadieron mapas, GPS, publicidad paga, dinero, wallets, comisiones, calendario externo, WhatsApp automático ni funcionalidades de Fase 7.
