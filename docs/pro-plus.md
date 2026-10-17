# Gratis, PRO y PRO Plus

## Condiciones

- Gratis conserva sus contactos, reseñas, agenda y el cupo vigente después del primer cliente.
- PRO conserva todos sus beneficios, incluido el portfolio de 10 trabajos × 5 fotos. Se presenta como **Recomendado**; no se afirma que sea el más elegido.
- PRO Plus agrega 30 trabajos × 5 fotos, hasta 3 fijados, comparaciones antes/después, PDF de presupuestos propios y exportación CSV de Tu mes. No obtiene prioridad adicional en Destacados ni en resultados orgánicos.
- Precio nuevo de PRO: fuente vigente `/plans` (por defecto $15.000); Plus: `PRO_PLUS_MONTHLY_PRICE_ARS` ($24.900 por defecto). Importes decididos por el servidor, nunca por el navegador. La oferta de bienvenida actual aplica solo a PRO.
- Nuevas pruebas: 7 días como máximo, opt-in, sin tarjeta, una vez y después del primer cliente; no habilitan Plus. Una configuración antigua de 14 días queda acotada a 7 para activaciones nuevas. Los períodos ya activados conservan sus fechas y duración registradas. Los referidos conservan sus propios días de PRO.

## Plan y cobros

`effectivePlan`, `planSource`, `resolveProfessionalEntitlements` y `EFFECTIVE_PRO_SQL` continúan siendo las fuentes del acceso. Se agrega `PRO_PLUS` al tier; no hay una fuente comercial paralela. Entre fuentes vigentes gana la mayor capacidad; a igual tier se mantiene manual > billing > transferencia > bonus. El bonus siempre es PRO.

Las suscripciones y transferencias guardan su `plan_tier`. La migración asigna PRO a los contratos existentes y no cambia precios ni fechas. La reconciliación deriva `billing_plus_until` del subconjunto Plus, conservando mora, cancelación y arrepentimiento existentes. Transferencia conserva el inicio del período: comprar Plus por adelantado durante un bonus no habilita Plus antes de esa fecha.

Una sola suscripción abierta por persona. Se puede reemplazar un checkout pendiente de otro tier. Por defecto no se modifica el monto de una suscripción vigente para cambiar de plan: se cancela la renovación y se elige el nuevo plan cuando termina el período pago, y las renovaciones por transferencia durante acceso pago mantienen el mismo tier. Sin prorrateo ni upgrade inmediato.

Con los flags `PLAN_CHANGE_TRANSFER_ENABLED` / `PLAN_CHANGE_MP_ENABLED` (apagados por defecto) se puede **programar PRO → PRO Plus para el próximo período**, sin cancelar y sin perder días pagados; ver [`backend/README.md` → "Cambio programado PRO → PRO Plus"](../backend/README.md#cambio-programado-pro--pro-plus) (qué está comprobado con Mercado Pago y qué no, estados, fallos y decisiones pendientes) y las capturas en [`docs/plan-change/`](plan-change/).

## Portfolio y archivos

Fijados y antes/después se revalidan bajo el lock del perfil. La comparación exige dos fotos distintas y activas del mismo trabajo; mover o borrar una foto limpia ambas referencias. Los fijados tienen máximo tres trabajos activos, también con escrituras concurrentes. Al vencer Plus, su presentación se oculta por entitlement; los trabajos que exceden el nuevo límite se archivan sin borrarse y se reactivan explícitamente.

- `GET /pro/quotes/:id/pdf`: solo presupuesto propio y con Plus vigente; PDF generado en el servidor (PDFKit), nombre del profesional, contenido y montos reales. No incorpora contactos ni dirección del cliente, no hace solicitudes a imágenes remotas y no es una factura. No crea presupuestos nuevos ni registra aceptaciones.
- `GET /pro/analytics/month/export?year=…&month=…`: Plus vigente, mismo cálculo de Tu mes, totales, exposición, semanas y desgloses. CSV con BOM UTF-8, separador `;`, escape de celdas y protección ante fórmulas. Sin exportación de personas del grupo de comparación.
- Ambos archivos usan la sesión habitual y `Cache-Control: private, no-store`; nunca incluyen tokens en URLs ni se envían automáticamente.

## Operación y validación

Nueva migración `1795300000000-ProPlus`: backend y migración antes de frontend. Revertir degrada los tiers Plus a PRO para poder volver al enum anterior y elimina sus metadatos específicos. No ejecutar rollback en producción como sustituto de cancelar contratos en el proveedor.

Validaciones locales: frontend 898 tests, backend 327 unitarios, compilación Angular/backend, tipos y lint. SQL de la migración aplicado/revertido/aplicado en PGlite. El PDF de muestra fue renderizado y su contenido comprobado. La verificación con PostgreSQL nativo y toda la API se ejecuta en el workflow del PR; sus resultados son la referencia final. La revisión visual en un navegador real queda registrada en el PR según su alcance, sin dar por probadas pantallas autenticadas que no se hayan abierto.

Primera corrida nativa: 838/839 tests pasaron; el único desajuste fue la expectativa anterior de `/plans`, que no incluía `proPlus`. Se actualiza la expectativa completa para exigir también el precio y la contratación del tercer plan. El resultado del último commit del PR es la referencia final. La preview de Vercel requiere iniciar sesión; no se completó la revisión visual autenticada ni la revisión a los tres anchos.


## Administración de ambos planes

En `/admin/precio`, el selector PRO / PRO Plus controla el precio vigente, el historial y el resumen de suscripciones por importe del plan elegido. `GET /admin/pricing?plan=PRO_PLUS` y `PUT /admin/pricing` con `plan: PRO_PLUS` operan sobre el historial específico de Plus; omitir el plan conserva PRO para los clientes anteriores del API. La bienvenida sigue siendo exclusiva de PRO. El cambio afecta nuevas contrataciones por Mercado Pago y nuevos pedidos por transferencia, nunca modifica el importe de suscripciones ni pagos ya creados.

Migración nueva `ProPlusAdminPricing1795400000000`: agrega el tier al historial existente (PRO por defecto), constraint de planes pagos e índice por plan y último cambio. Aplicar backend y migración antes de frontend. Al revertir, elimina solo los cambios de precio de Plus antes de retirar la columna; los contratos no se modifican.

En `/admin/usuarios`, “Dar PRO o PRO Plus” permite elegir plan y duración para una cortesía manual. No se cobra ni marca `first_paid_pro_at`; se mantienen los bloqueos ante una suscripción activa. La respuesta informa `manualTier` y el estado muestra “PRO Plus manual” cuando corresponde. Al vencer o quitarlo sigue aplicando el resolver habitual: puede conservar PRO por otra fuente vigente.
