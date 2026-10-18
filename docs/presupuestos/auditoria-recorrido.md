# Auditoría del recorrido de presupuestos

18 de octubre de 2026. Base revisada: `88bc8cfc7d167c6ba083ee0b92b38418b2d8e518`.

## Resultado y alcance

Se revisó el circuito de cliente y profesional en código y mediante pruebas automatizadas. Esta revisión corrige cuatro problemas de interfaz y un riesgo de concurrencia; no modifica precios, cupos, demoras, elegibilidad ni reglas de los planes. No permite concluir que aumente la conversión o la renovación de PRO.

No se consultó ni modificó producción. No hubo envíos reales de correo ni push. No hay capturas ni una pasada manual nueva: este entorno no tiene navegador ni PostgreSQL local disponibles. Las pruebas de interfaz usan DOM y HTTP simulado; las de API usan el PostgreSQL descartable y los proveedores falsos del harness en CI.

## Correcciones

| Hallazgo | Efecto | Corrección y prueba |
| --- | --- | --- |
| El formulario aplicaba el cupo global a un pedido dirigido | Un Free sin oportunidades discovery no podía enviar desde la interfaz aunque el backend lo permite | La advertencia y el guard de envío respetan `opportunity.targeted`, edición y presupuesto existente. Regresión de dirigido sin cupo y bloqueo discovery conservado |
| Fechas construidas con el día del navegador | En otra zona horaria, disponibilidad y vigencia podían quedar en otro día de Argentina | `businessDay`, `shiftDay` y el desfase argentino compartidos. Prueba bajo UTC a las 02:30Z, todavía el día anterior en Argentina |
| Presupuesto vencido con pantalla abierta | Cliente y profesional seguían viendo acciones sobre una propuesta pendiente desactualizada | `refreshWhenDue` relee cliente, detalle profesional y edición. El backend decide EXPIRED; el reloj no cambia estados. Se cierra la confirmación de elección si la propuesta deja de estar disponible. Pruebas de los tres puntos |
| Varias novedades en una sola consulta | Si el último aviso era de otro pedido, el detalle abierto podía no actualizarse | Se observan las novedades sin leer del pedido visible en lugar de solo `lastArrival`. La apertura inicial ya trae datos actuales y no hace una segunda lectura innecesaria. Una tanda con dos pedidos verifica relectura, leído propio y aviso ajeno conservado |
| Orden de bloqueo distinto al cerrar desde cliente o profesional | La consulta conjunta de trabajos podía tomar el trabajo antes de la solicitud y cruzarse con el camino del cliente | `JobsService` bloquea primero la solicitud y luego el trabajo, con filtro de dueño en ambos. Unitario del orden y prueba de API de cierre simultáneo con una sola transición/evento/aviso |

## Recorrido contrastado

| Etapa | Contrato y cobertura |
| --- | --- |
| Armar y enviar | El asistente de cuatro pasos y `/presupuesto` conservan el borrador al ingresar, recargar y reintentar. Las suites existentes cubren envío y destinatarios; no se crea un circuito nuevo |
| Recibir y responder | Se mantienen las reglas de invitación y del acceso inicial, pedidos dirigidos y discovery. El formulario usa la oportunidad enviada por el backend, que revalida al enviar |
| Presupuestar y editar | Descripción, mano de obra, materiales y total usan los contratos existentes; editar conserva el mismo presupuesto y no consume otra oportunidad. Fechas argentinas y vencimiento se cubren en este cambio |
| Avisar y comparar | La prueba de API edita el precio y comprueba el aviso in-app y los importes actuales de dos propuestas. La prueba de interfaz cubre el lote de avisos de distintos pedidos |
| Elegir | La aceptación existente crea el trabajo en la transacción, reserva el elegido y conserva la privacidad frente al otro invitado. La prueba nueva verifica un solo trabajo, contacto del elegido y 404 al trabajo ajeno |
| Coordinar | El flujo actual de Trabajos permite al profesional agendar directamente: no es una propuesta que el cliente deba confirmar. Se prueba agenda, reintento sin duplicar avisos y pedido de otro horario del cliente sobre el mismo trabajo. El circuito anterior de citas conserva sus pruebas |
| Cerrar | El horario habilita el cierre, nunca lo completa solo. La prueba rechaza un cierre anticipado y luego permite cerrar; otra prueba hace coincidir cliente y profesional |
| Reseñar | Solo después de COMPLETED, una reseña por pedido, sin cambiar el estado del trabajo. La prueba nueva verifica duplicado rechazado, reputación recalculada y contacto privado retirado al cerrar |

La prueba transversal está en `backend/test/quote-lifecycle.e2e-spec.ts`. Cambia la fecha de sus propios trabajos de prueba para simular el fin del horario; nunca usa una base productiva.

## Validación y límites

- Local: suite frontend completa (1.192 tests), suite unitaria backend completa (359 tests), lint y typecheck. Build y controles de CI se informan en el PR con su resultado final.
- API: CI ejecuta las suites e2e con `TEST_DATABASE_URL`, PostgreSQL descartable y servicios externos falsos. No se presenta un e2e omitido localmente como si hubiera pasado.
- No hay migración ni cambio de configuración.
- No se comprobó entrega real de email/push ni sus preferencias y credenciales en producción. Una notificación guardada no acredita su entrega por esos canales.
- Si se quisiera permitir renovar una propuesta vencida desde la interfaz, hace falta definir ese recorrido y su interacción con las oportunidades ya consumidas. Este cambio retira acciones inválidas, sin inventar esa regla.
- La revisión visual manual a 390, 1024 y 1440 px sigue pendiente por la falta de navegador. No se afirma validación de axe ni ausencia de errores de consola en un navegador real.
