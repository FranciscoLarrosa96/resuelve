# Referidos: progreso y bonus PRO

## Datos y condiciones

`GET /api/v1/pro/acquisition/referrals` conserva la respuesta de invitaciones enviadas y agrega `incoming`, la invitación recibida por la cuenta autenticada. Es `null` si no existe. El guard profesional y el filtro por perfil propio se mantienen.

`incoming` devuelve `status`, `rewardDays` y `steps`. Los días pendientes salen de `REFERRAL_REWARD_DAYS`; una recompensa otorgada usa `referral_rewards.days`, incluso si luego cambia la configuración. No se exponen IDs del referente ni motivos de invalidación.

El backend comparte los predicados SQL de progreso con activación, sin cambiar sus condiciones:

- Cuenta existente y registrada mediante invitación.
- Perfil ACTIVE con headline no vacío; no se agregan requisitos de bio, fotos o experiencia.
- Al menos un servicio activo que pueda ofrecerse públicamente.
- Cobertura de toda la ciudad o una zona activa.
- Matrícula aprobada y vigente cuando hace falta para ofrecer al menos un servicio público. Si existe un servicio activo sin matrícula obligatoria, la matrícula no es un paso de este beneficio.
- Presupuesto existente a un cliente distinto del profesional y del referente, con la condición exacta de la regla actual; no se añaden filtros de estado ni nuevos criterios antifraude.

La consulta es de lectura: no activa, otorga ni extiende bonus. No modifica billing, Mercado Pago, códigos ni montos.

## Presentación

`ReferralProgress` se integra en `ReferralsPanel`, ya presente en Mi Plan. Usa iconos existentes y tokens semánticos, sin emojis, gradientes ni confetti. La cuenta normal no ve el bloque.

| Estado | Presentación |
| --- | --- |
| REGISTERED | Días, checklist backend, pasos restantes y un CTA para el primer requisito pendiente |
| ACTIVATED | Requisitos cumplidos; beneficio pendiente, sin solicitar pasos otra vez |
| REWARDED | Confirmación y días realmente otorgados a ambas cuentas |
| INVALID | Bloque oculto, sin promesa ni detalles internos |

CTA: presentación/servicios/cobertura llevan a `/pro/perfil?editar=...` y abren la sección correcta; matrícula lleva a `/pro/perfil#sec-verifications`; presupuesto lleva a `/pro/solicitudes`. Actualizar progreso vuelve a consultar el endpoint, con protección contra solicitudes simultáneas y error recuperable.

## Verificación

- Angular: 538 pruebas pasan (39 archivos), incluyendo estados, días dinámicos, CTAs, actualización y apertura de edición sin reapertura al cancelar.
- Backend unit: 189 pruebas pasan (32 suites).
- Backend typecheck: correcto.
- Build frontend: correcto, 24 rutas prerenderizadas. Avisos existentes de bundle inicial (543,88 kB / 520 kB) y Home CSS (6,27 kB / 4 kB).
- Progreso renderizado por Angular con fixture de test, aislado de producción: validado en 390, 768, 1024, 1280, 1440 y 1920 en ambos temas, sin overflow; foco visible de teclado, CTA de 44 px y ancho completo en mobile.
- E2E de adquisición ampliados con la respuesta incoming. Los 9 tests quedaron omitidos por falta de TEST_DATABASE_URL; no se verificó el endpoint contra PostgreSQL real en esta sesión.
- Para que aparezca en un entorno publicado, ese entorno deberá contar con el backend y frontend de este cambio. No se realizó push, merge, PR ni deploy.
