# Arrepentimiento en PRO Plus programado por transferencia

> **Política comercial aprobada (17/10/2026):** se puede pedir la devolución de cada pago por transferencia
> **desde que lo confirmamos hasta 10 días corridos después del inicio efectivo del período pagado**, con devolución
> total. Es un **beneficio contractual** que ofrecemos; no es una conclusión sobre el mínimo legal ni limita derechos
> que correspondan (ver "Revisión jurídica"). El resto del documento describe cómo quedó implementada.
>
> El código y los Términos de este PR implementan esa política. `PLAN_CHANGE_TRANSFER_ENABLED` y `PLAN_CHANGE_MP_ENABLED` siguen apagados y los Términos **no están
> publicados** hasta mergear. No es asesoramiento legal: los puntos que necesitan revisión jurídica están al final y
> no bloquean el resto del trabajo.

## Fuentes y límites

| Norma | Qué se tomó | Estado de la lectura |
|---|---|---|
| Ley 24.240 art. 34 y CCyC art. 1110 | 10 días corridos, irrenunciables, desde la entrega o la celebración del contrato (lo último); en contratos a distancia, desde la celebración. | Texto citado por comentarios ([Marval](https://www.marval.com/Publicacion/en-los-contratos-electronicos-el-consumidor-tiene-la-facultad-de-revocarlo-por-la-misma-via-12734), [código comentado](https://codigocivilonline.com.ar/contratos-de-consumo-arts-1092-a-1122/)). |
| [Disposición 954/2025](https://www.argentina.gob.ar/normativa/nacional/disposici%C3%B3n-954-2025-417152/texto) (B.O. 4/9/2025) | Deroga las Res. 316/2018 y **424/2020** (que la propuesta anterior citaba como vigente: error). Botón de arrepentimiento y de baja para quien vende bienes y servicios a distancia; sin registro previo ni trámites adicionales; el proveedor responde por el mismo medio en 24 h con un código y adopta las medidas para efectivizarlo. Plazo de adecuación: 60 días, vencido el 3/11/2025. | **No pude abrir el texto oficial** (el entorno bloquea `argentina.gob.ar` y `boletinoficial.gob.ar`). Lo anterior sale de resúmenes de estudios jurídicos ([Noetinger & Armando](https://noetingeryarmando.com/nuevas-reglas-para-el-boton-de-arrepentimiento-y-la-proteccion-del-consumidor-digital-disposicion-954-2025/), [Nicholson y Cano](https://nicholsonycano.com.ar/alertas-legales/disposicion-ministerio-de-economia-954-2025-nueva-reglamentacion-sobre-boton-de-arrepentimiento-y-boton-de-baja-de-servicio/), [RCTZZ](https://rctzz.com.ar/es/insights/%F0%9F%93%9C-evolucion-normativa-del-lboton-de-arrepentimientor-y-nuevas-obligaciones-para-proveedores.disposicion-954-2025)). |
| [Disposición 3/2026](https://www.boletinoficial.gob.ar/detalleAviso/primera/338248/20260206) (B.O. 6/2/2026) | Permite al proveedor verificar la identidad de quien usa los botones, con pasos razonables, por medios habituales y con la única finalidad de verificar identidad y seguridad. | Tampoco accesible; leída en [Abogados.com.ar](https://abogados.com.ar/disposicion-32026-derecho-de-arrepentimiento/38519) e [Infobae](https://www.infobae.com/politica/2026/02/06/boton-de-arrepentimiento-las-empresas-podran-pedir-informacion-extra-cuando-el-usuario-quiera-suspender-un-servicio/). |

**Hay que contrastar los artículos exactos con el texto oficial antes de publicar.** Lo que no figura en ninguna de las
fuentes que pude leer, y por eso no se afirma:

1. Si, con prestación diferida, el plazo corre desde el pago o desde que el servicio empieza.
2. Si, empezada la prestación dentro de los 10 días, se puede descontar proporcionalmente.
3. El plazo exacto de devolución: **un único resumen** menciona "hasta 5 días hábiles" para efectivizar la baja o la devolución; no está confirmado.

## ¿Esto es una obligación legal para este servicio?

**Primera pregunta jurídica, y condiciona el resto.** Los resúmenes de la Disposición 954/2025 indican que no alcanza a
contratos para reventa o integración en procesos productivos. Un profesional que paga PRO para promover su actividad podría
no ser "consumidor" en esos términos (Ley 24.240, art. 1). Hasta que se resuelva, el diseño separa dos planos:

| | Obligación legal (si aplica) | Beneficio contractual que ofrecemos (aunque no aplique) |
|---|---|---|
| Plazo | 10 días corridos, sin explicar el motivo ni costo | Lo ofrecemos a todos los profesionales, sean o no consumidores |
| Cómputo | Desde la celebración del contrato (art. 1110) | Desde la **confirmación** de cada pago (se puede pedir desde ahí) y **hasta 10 días corridos después del inicio efectivo del período pagado**. No es una conclusión sobre cómo se computa el mínimo legal: **a revisar** (punto 1 del cierre) |
| Botón y código | Botón sin registro previo; código por el mismo medio en 24 h | El código es el del pago y se muestra en el acto en pantalla |
| Identidad | Verificación razonable permitida (Disp. 3/2026). **Permite verificar; no elimina el requisito de un acceso destacado y visible al botón (954/2025)** (corrección: antes se dijo que exigir sesión "no choca"; eso no se sigue de la 3/2026) | Acceso público y visible `/arrepentimiento` (pie de todas las pantallas y Términos) que lleva al trámite existente; se verifica la identidad con la sesión **antes** de modificar un pago o el acceso; no se pide nada más que el alias/CBU de devolución |
| Devolución | Efectivizarla (¿5 días hábiles? sin confirmar) | Total del pago revocado, **sin descontar días usados**, aunque el período ya haya empezado |
| Pagos con otros posteriores | — | Se puede pedir sobre **cualquier** pago con plazo abierto; se registra con su fecha; nada se anula solo |

## Política comercial aprobada

| Pregunta | Recomendación |
|---|---|
| Desde cuándo | Desde que confirmamos cada pago (también antes de que el período empiece), sobre el pago que la persona elija. |
| Hasta cuándo | **10 días corridos desde el inicio efectivo del período pagado**, medidos contra el momento de la **solicitud**, no de la resolución. Inicio inmediato (o confirmación tardía: Plus empieza al confirmar) = 10 días desde la confirmación; Plus programado = 10 días desde que Plus empieza. Cálculo único: `computeWithdrawalUntil` (`transfer-rules.ts`); se guarda en `transfer_payments.withdrawal_until` y lo usan el backend, la API (`until`), Mi plan, `/arrepentimiento`, los Términos y el panel admin. |
| Un reajuste adelanta el período | **Nunca se acorta una ventana ya informada**: el vencimiento pasa a ser el mayor entre el comunicado y los 10 días desde el nuevo inicio. |
| Plus todavía no empezó | Se anula ese pago, se devuelve el total y el acceso de hoy y el PRO ya pagado no cambian. |
| Plus ya empezó | Termina en el acto; devolución total sin descontar uso (beneficio contractual, punto 2 del cierre). |
| Cómo se devuelve y quién | Transferencia al alias/CBU indicado; la hace **a mano un admin** (`/admin/pagos` → "Ya lo devolví"). El plazo de devolución queda por decidir (H): candidato 5 días hábiles, solo si el texto oficial lo confirma. |
| Cómo se conserva el PRO pagado | Solo se anula el pago pedido; el acceso se recalcula desde lo que sigue confirmado. |

### Pedido sobre un pago que tiene otros posteriores (sin la regla "primero el último")

Antes, el botón solo permitía revocar el último pago. Ahora cada pago con plazo abierto se puede pedir, y hay dos caminos:

1. **Ningún pago posterior depende de sus fechas** (es el último): se revoca en el acto, como antes.
2. **Hay pagos posteriores** (p. ej. un PRO con un PRO Plus programado detrás): se **registra la solicitud** y la resuelve un admin.
   - *Cómo se conserva la fecha:* `transfer_payments.withdrawal_requested_at` guarda el momento del pedido. El plazo se mide contra esa fecha; al resolver, `withdrawn_at` toma ese valor, así que resolver días después no gasta la ventana. Repetir la solicitud responde 409 y no pisa la fecha.
   - *Cómo se evita dar acceso sin pagar:* mientras no se resuelve, el pago sigue vigente y el acceso no cambia (tampoco se devuelve nada: ni se pierde ni se duplica). Al resolver (`POST /admin/transfers/:id/withdrawal/resolve`), el pago pasa a `WITHDRAWN` y los posteriores se **adelantan** para empezar cuando corresponde sin el período revocado (`retimeAfterRevocation`): conservan su duración, nunca se atrasan, y el total de días de acceso es solo el de lo que sigue pagado. Un hueco con PRO sin pagar no puede aparecer.
   - *Qué NO pasa:* ningún otro pago se anula automáticamente. Si la persona también quiere revocar el posterior, lo pide aparte (ese es el último y se revoca en el acto); el anterior se resuelve después sin mover nada.
   - *Qué decide el equipo:* solo ejecutar la resolución y la devolución a mano; no elige qué pagos se anulan.

### Acceso público al trámite (corrección 2)

- **Qué hay:** la página pública `/arrepentimiento` (prerenderizada, en el sitemap y `llms.txt`), enlazada desde el pie de **todas** las pantallas (versión completa y compacta) y desde los Términos. Explica plazo, código, devolución y qué se verifica.
- **Reutiliza el flujo existente:** el único lugar que modifica pagos o acceso sigue siendo Mi plan (`#arrepentimiento`). Sin sesión, el botón lleva a `/ingresar?returnUrl=/pro/plan#arrepentimiento` (la identidad se verifica con la cuenta que contrató, antes de cualquier cambio) y vuelve directo al trámite; con sesión, va directo.
- **Qué NO hace:** no lista ni muestra pagos, montos ni códigos; no tiene ningún botón que revoque; ningún tercero puede revocar (el backend sigue exigiendo la sesión del dueño del perfil).
- **Sin acceso a la cuenta:** ver la sección siguiente. La recuperación de contraseña y un email oficial de contacto siguen sin existir en el producto; esta alternativa es el camino para quien no puede ingresar.
- **Límite abierto (revisión jurídica 4):** si pasar por el login (o por la verificación del equipo en el camino sin cuenta) antes de modificar un pago cumple la 954/2025 y la 3/2026.

### "No puedo ingresar a mi cuenta" (solicitud sin sesión)

En `/arrepentimiento`, un formulario público registra una solicitud con los datos mínimos: nombre, correo, teléfono (opcional), código del pago `RES-XXXXXX` (opcional, **sin validar ni buscar**), lo que recuerda del pago (opcional) y el consentimiento para usar esos datos solo en este trámite.

| Qué | Cómo |
|---|---|
| Comprobante | Se muestra al enviar: código `ARR-XXXXXX` y **fecha y hora del servidor** (hora de Argentina), con el texto de que *todavía no se revocó ningún pago ni se hizo ninguna devolución*. No se envía por correo (el producto no manda emails a quien no tiene cuenta). |
| Qué NO hace | No consulta cuentas ni pagos al recibirla: la respuesta es idéntica exista o no la contratación (solo `code` y `requestedAt`), no modifica acceso, no revoca pagos, no emite devoluciones. |
| Fecha | `withdrawal_contact_requests.requested_at` (la pone la base). Es la que cuenta para el plazo aunque la verificación termine después. |
| Verificación | La hace una persona del equipo **fuera del sistema** (contactando a la persona). Recién entonces, en `/admin/pagos` → "Arrepentimientos sin sesión", **vincula** la solicitud con el pago (código `RES-` + alias/CBU de devolución que indicó la persona). |
| Vínculo | El pago queda con una solicitud registrada cuya fecha es la **original** (`withdrawal_requested_at = requested_at`). Si esa fecha ya excedía la ventana del pago (10 días desde su confirmación), **no se vincula** (409 `TRANSFER_WITHDRAWAL_EXPIRED`): fuera de plazo es una decisión comercial, no automática. |
| Resolución | Con el flujo de siempre ("Resolver arrepentimiento"): `withdrawn_at` = fecha original, devolución total a mano, posteriores reajustados sin mover los ya empezados. La solicitud pasa a `RESOLVED`. También se puede **descartar** con una nota (`DISMISSED`) si no se pudo verificar. |
| Abuso | Límite por IP (`THROTTLE_WITHDRAWAL_REQUEST_LIMIT`, 4/min), máx. 3 solicitudes por correo por día, tope diario global (`WITHDRAWAL_REQUESTS_DAILY_CAP`, 300) y reenvío idéntico = mismo comprobante. Infraestructura reutilizada: `@Throttle`, `@Public`, `AppException`, `AdminGuard`, el flujo de resolución. |
| Datos | Se guardan en `withdrawal_contact_requests` (migración `WithdrawalContactRequests`). No están atados a la cuenta: no se borran al eliminarla. **No hay hoy una purga automática**; la Política de Privacidad dice "mientras se resuelve y el tiempo necesario para acreditar el trámite" sin fijar un plazo: queda para decidir (punto 6). |

Qué impide revocaciones por terceros: registrar no cambia nada, y vincular lo hace solo un admin que verificó la identidad.

### La solicitud registrada sigue visible

La ventana limita **iniciar** una solicitud, no **consultarla**. `GET /billing/transfer` devuelve en `withdrawals` los pagos con ventana abierta **o** con una solicitud ya registrada (`canRequest: false` para la segunda). Mi plan muestra la fecha de la solicitud, el código, "solicitud en trámite", que el plazo haya vencido no la cancela, y no ofrece iniciar otra. Desaparece de la lista cuando un admin la resuelve (queda la devolución pendiente con el mismo código). Un segundo intento sobre un pago ya pedido responde `TRANSFER_WITHDRAWAL_PENDING` (no "vencido").

### Al resolver, con pagos posteriores en distinto estado

`retimeAfterRevocation` solo **adelanta períodos que todavía no empezaron**. Nunca toca uno que ya empezó o terminó, así que no reinicia períodos consumidos ni duplica días:

| Pago posterior | Qué pasa al resolver |
|---|---|
| Todavía no empezó (p. ej. Plus programado) | Se adelanta para empezar cuando termina lo que sigue pagado (o ahora): misma duración que pagó, nunca se atrasa. Cambia de fechas → **se avisa**. |
| Ya empezó (en curso) | No se mueve: conserva inicio y fin. Si había uno sin empezar detrás de él, tampoco (no hay hueco que cerrar). |
| Ya terminó | No se mueve ni se regalan días; sin acceso vigente → Free. |
| Varios | Se encadenan en orden; ninguno se atrasa. |

El revocado se devuelve por completo en todos los casos (el período anterior ya consumido se devuelve igual: es el beneficio contractual de no descontar uso, punto 2 del cierre). **Aviso al profesional:** al resolver se crea `PRO_TRANSFER_WITHDRAWAL_RESOLVED` (in-app, sin email ni push; migración `TransferWithdrawalResolvedNotice`) con el código y, solo si cambiaron, las fechas nuevas de cada pago reajustado (código, plan, desde, hasta); si no cambió ninguna lo dice. Las fechas nuevas también quedan en Mi plan.

### Ejemplo con fechas

PRO por transferencia confirmado el 6/10 → vigente hasta el **5/11**. El 18/10 se confirma un PRO Plus de 1 mes ($24.900): empieza el 5/11 y termina el 5/12.

- **Ventana del Plus:** desde el 18/10 hasta el **15/11** (10 días desde su inicio efectivo, el 5/11). Puede pedir antes de que empiece.
- **Ventana del PRO** ($15.000, confirmado el 6/10, inicio inmediato): 6/10–16/10.
- **22/10, pide el Plus** (último pago, no empezó): se anula en el acto; se devuelven $24.900; sigue con PRO hasta el 5/11.
- **Caso con dos pagos abiertos:** PRO confirmado el 10/10 (hasta el 9/11, ventana hasta el 20/10) y PRO Plus confirmado el 12/10 (9/11–9/12, ventana hasta el 19/11). El 14/10 pide revocar el **PRO**. Se registra el 14/10 (fecha cierta); acceso y pagos intactos. El 25/10 un admin lo resuelve (la ventana del PRO ya venció el 20/10; no importa: cuenta el 14/10): el PRO queda `WITHDRAWN` con su devolución de $15.000, y el Plus se adelanta al 25/10–24/11 (30 días, los que pagó). Su ventana **no se acorta**: sigue hasta el 19/11 (era el mayor entre lo informado y 10 días desde el 25/10).
- **16/11, intenta revocar el Plus de 18/10 → 5/11:** fuera de plazo (409 `TRANSFER_WITHDRAWAL_EXPIRED`).
- **Confirmación tardía:** el admin confirma el Plus el 10/11 (el PRO venció el 5/11). Empieza el 10/11 y la ventana llega al 20/11. Si revoca el 14/11, devolución de $24.900 completos y vuelve a Free ese día.

## Diferencias respecto de la propuesta anterior

0. **(Política aprobada)** La ventana por transferencia pasa de «10 días desde la confirmación» a «desde la confirmación hasta 10 días después del inicio efectivo del período». Migración nueva `TransferWithdrawalUntil` (columna `withdrawal_until`). Textos de Mi plan, `/arrepentimiento`, Términos y panel admin alineados.

1. **Fuentes:** se reemplaza la Res. 424/2020 (derogada) por la Disp. 954/2025 y se suma la Disp. 3/2026; se explicita qué no se pudo leer. Se retira la afirmación "nunca acorta el plazo legal" y se la reemplaza por una inferencia rotulada.
2. **Obligación vs. beneficio:** se separan en una tabla y se agrega la duda previa sobre si un profesional es "consumidor".
3. **Sin "revocar el último primero":** deja de ser una condición. Cualquier pago con plazo abierto se puede pedir; si tiene posteriores, se registra y se resuelve a mano. Nueva migración (`withdrawal_requested_at`, índice parcial), nuevo endpoint admin y código de error `TRANSFER_WITHDRAWAL_PENDING`.
4. **Plazo medido contra la solicitud**, no contra la resolución.
5. **Términos:** texto de la solicitud registrada; fecha visible unificada con la versión (ver abajo).
6. **(Corrección 2)** Solicitud visible hasta resolverse aunque venza la ventana; acceso público `/arrepentimiento`; resolución con pagos posteriores ya empezados o terminados sin moverlos; aviso con fechas nuevas (migración y tipo de aviso nuevos). Se retira la frase de que exigir sesión "no choca" con la Disp. 3/2026.
7. **(Corrección 3)** Alternativa pública "No puedo ingresar a mi cuenta": solicitud sin sesión con comprobante, vinculación por un admin con la fecha original; nueva tabla/migración, endpoint público con límites y panel admin. La política comercial final queda para aprobar.
8. **Devolución (H):** el candidato "5 días hábiles" entra como pendiente de verificar; ya no se afirma que no hay plazo legal.

## Términos

`TERMS_VERSION` / `CURRENT_TERMS_VERSION` = `2026-10-17`. La fecha visible y el `datetime` ahora **se derivan de la versión** (`TERMS_UPDATED_DATE`, `TERMS_UPDATED_LABEL`), así que no pueden desfasarse (antes: versión 15/10, `datetime` 13/10, texto 15/10). Al fijar la fecha real de publicación se cambia **solo** `TERMS_VERSION` (front) y `CURRENT_TERMS_VERSION` (backend, `backend/src/legal/terms.ts`). La Política de Privacidad tiene su propia fecha y no cambia en este PR.

## Contrataciones anteriores y solicitudes existentes

- **Pagos confirmados antes de esta política** (`withdrawal_until` vacío): conservan lo que se les informó, **10 días desde la confirmación**; la migración no los toca (no se reducen ni se extienden) y ninguna solicitud existente se borra ni se modifica. Si un reajuste adelanta uno de esos pagos, rige el mayor entre su vencimiento de siempre y los 10 días desde el nuevo inicio.
- **Solicitudes ya registradas** (con sesión o sin sesión): siguen visibles hasta resolverse y conservan su fecha original; el vencimiento solo se usa para aceptarlas, nunca para cancelarlas.
- **Solicitudes sin sesión**: al vincularlas, el admin las evalúa contra el vencimiento vigente del pago (el guardado) usando la fecha original de la solicitud; si el pago es Plus programado, una solicitud anterior al inicio o hasta 10 días después se acepta.
- La política nueva aplica a las contrataciones que se confirmen desde que se mergea; con los flags apagados no cambia nada visible para nadie hasta habilitar.

## Revisión jurídica (puntos exactos, sin bloquear)

1. ¿Un profesional que contrata PRO es "consumidor" para la Disp. 954/2025 (exclusión de contratos para producción o reventa)? ¿Y cómo se computa el mínimo legal (celebración del contrato) frente al beneficio contractual de contar desde el inicio efectivo del período? No se afirma cumplimiento: se ofrece como beneficio y no limita derechos que correspondan.
2. Devolución total aunque la prestación ya haya empezado: ¿se puede o se debe descontar?
3. Plazo de devolución (¿5 días hábiles?) y verificación del texto de los artículos de 954/2025 y 3/2026.
4. Si el acceso público `/arrepentimiento` (con login para el trámite directo y la alternativa sin sesión con verificación del equipo) cumple la 954/2025 (sin registro previo) y la 3/2026, incluida la respuesta con código en 24 h (el comprobante se muestra en el acto).
6. Plazo de conservación de las solicitudes sin sesión (hoy sin purga automática) y si deben guardarse datos de contacto más allá de la resolución.
5. Que la solicitud registrada con pagos posteriores cumple la respuesta de 24 h con código (se muestra en el acto) aunque la resolución sea manual.

## Para habilitar solo transferencia (una vez aprobada la decisión A y con CI verde)

1. Aprobar la decisión A, marcar el PR como listo y mergearlo (publica los Términos y aplica la migración; revisar que los pasos de despliegue de migraciones de Render corran).
2. En el backend poner `PLAN_CHANGE_TRANSFER_ENABLED=true` y reiniciar. `PLAN_CHANGE_MP_ENABLED` queda en `false`.
3. Verificar con un PRO por transferencia de prueba: "Pasar a PRO Plus", confirmación, aviso, botón de arrepentimiento por cada pago y la solicitud registrada en `/admin/pagos`.
