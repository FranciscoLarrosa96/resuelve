# Arrepentimiento en PRO Plus programado por transferencia

> **Decisión pendiente de aprobación (A).** El cambio de código y de Términos de este PR implementa la
> recomendación de abajo; `PLAN_CHANGE_TRANSFER_ENABLED` sigue apagado. No es asesoramiento legal: los
> puntos que necesitan revisión jurídica están en la sección final y **no bloquean** el resto.

## Qué dicen las fuentes (y qué no)

| Punto | Fuente | Alcance |
|---|---|---|
| 10 días corridos, irrenunciable, desde la entrega o la celebración del contrato (lo último) | Ley 24.240, art. 34 (texto citado en [Liga del Consorcista](https://ligadelconsorcista.org/consumidores-boton-de-arrepentimiento-reolucion-424-2020) y [Marval](https://www.marval.com/Publicacion/en-los-contratos-electronicos-el-consumidor-tiene-la-facultad-de-revocarlo-por-la-misma-via-12734)) | Mínimo legal |
| Contratos a distancia: 10 días **desde la celebración del contrato**; cláusulas que impidan revocar se tienen por no escritas | CCyC, art. 1110 ([texto comentado](https://codigocivilonline.com.ar/contratos-de-consumo-arts-1092-a-1122/); [Allende](https://allende.com/administrativo/los-proveedores-de-bienes-y-servicios-en-linea-deberan-incorporar-el-boton-de-arrepentimiento-en-sus-sitios-o-aplicaciones-web-10-09-2020/)) | Mínimo legal |
| Botón de arrepentimiento en el sitio y **código de identificación en 24 h**, por el mismo medio | [Res. SCI 424/2020](https://www.casi.com.ar/sites/default/files/res4242020sci.pdf) (B.O. 5/10/2020) | Mínimo legal |

Lo que **no encontré** en fuentes oficiales y por eso no se presenta como certeza:

1. Si el plazo corre desde el pago/aceptación o desde que el servicio **empieza** cuando la prestación es diferida.
2. Si, ya iniciada la prestación dentro de los 10 días, el proveedor puede descontar proporcionalmente.
3. Un plazo legal para efectuar la devolución.

**Limitación:** los sitios oficiales (Infoleg, argentina.gob.ar) no eran accesibles desde el entorno; las normas se leyeron en
comentarios y estudios jurídicos, y la Res. 424/2020 en el PDF publicado por CASI. Hay que contrastar el texto vigente antes de publicar.

## Recomendación

**Mínimo legal (lo que entendemos obligatorio):** poder revocar, sin explicar y sin costo, durante 10 días corridos
desde la contratación, por el mismo medio digital, con código de identificación.

**Decisión que tomamos (más generosa o más simple que el mínimo, no una obligación):**

| Pregunta | Recomendación |
|---|---|
| Desde cuándo | Desde que **confirmamos** cada pago (no desde que el comprador transfirió, ni desde que Plus empieza). Es igual o posterior a la celebración del contrato, así que nunca acorta el plazo legal. |
| Hasta cuándo | 10 días corridos después de la confirmación. No se extiende hasta que Plus empiece: un Plus que arranca a los 25 días no tiene una ventana de 35. |
| Plus todavía no empezó | Se anula ese pago y se devuelve el **total**. El acceso de hoy y el PRO ya pagado no cambian (siguen hasta su fecha). |
| Plus ya empezó (p. ej. confirmación tardía) | Plus termina en el acto y se devuelve el **total**, sin descontar los días usados. Es el criterio conservador mientras no haya una fuente que habilite descontar (punto 2 de arriba). |
| Cómo se devuelve y quién | Por transferencia, al alias/CBU/CVU que indique la persona; lo hace **a mano un admin** (`/admin/pagos` → "Devolución hecha"). Se muestra el código de arrepentimiento (el código `RES-XXXXXX` del pago) en el acto. Sin plazo prometido: no hay una fuente que lo fije y la operación es manual (decisión **H**). |
| Cómo se conserva el PRO ya pagado | Al revocar solo se anula el pago revocado; `transfer_pro_until` y `transfer_plus_*` se recalculan desde los pagos que siguen confirmados. El PRO pagado antes conserva sus fechas. |

### Ejemplo con fechas

PRO por transferencia confirmado el 6/10 por 1 mes → PRO hasta el **5/11**.

- **Plus programado.** El 17/10 pide 1 mes de PRO Plus ($24.900); el admin lo confirma el **18/10**. Plus empieza el **5/11** y termina el 5/12.
  La ventana va del 18/10 al **28/10**.
  - Revoca el 22/10: Plus no empezó → devolución de $24.900; sigue con PRO hasta el 5/11 como antes.
  - Intenta revocar el 29/10: fuera de plazo (`TRANSFER_WITHDRAWAL_EXPIRED`), aunque Plus todavía no haya empezado.
- **Confirmación tardía.** El mismo pedido, pero el admin confirma el **10/11** (el PRO venció el 5/11). Plus empieza el 10/11 y la ventana llega al **20/11**.
  - Revoca el 14/11: Plus ya corría hace 4 días → devolución de $24.900 completos y vuelve a Free ese día.

## Qué cambió en el código

- `GET /billing/transfer` → `withdrawal` ahora trae `planTier`, `reference` (código de arrepentimiento), `startsAt`, `endsAt` y `periodState`
  (`NOT_STARTED` | `STARTED`); `refundPending` trae `reference` y `planTier`. Sin migración, sin cambios de esquema.
- La pantalla deja de decir "quitamos esos días de PRO en el acto" cuando el período no empezó, y deja de prometer un aviso que no existe.
- Términos (`#pro-pagos`): subsección "Pasar de PRO a PRO Plus (transferencia)" y arrepentimiento por transferencia reescrito. `TERMS_VERSION` / `CURRENT_TERMS_VERSION` → `2026-10-17`.
- Pruebas: `backend/test/plan-change.e2e-spec.ts` (Plus programado, confirmación tardía, ventana desde la confirmación), `transfer-rules.spec.ts`, `pro-transfer-panel.spec.ts`, `terms-page.spec.ts`.

## Contrataciones anteriores

Los pagos ya confirmados (PRO solo) **no cambian de comportamiento**: la ventana seguía contando desde la confirmación, se
seguía devolviendo el total y quitando el período en el acto (en un PRO ya iniciado es lo mismo que ahora, `periodState = STARTED`).
Lo único visible para ellos es el texto de pantalla (menciona el plan y el código) y el código de arrepentimiento mostrado
después de revocar. Los Términos nuevos aplican a lo que se contrate o revoque desde su publicación; no se pide reaceptación (ya no se pide hoy).

## Revisión jurídica (puntos exactos, sin bloquear)

1. **Cómputo con prestación diferida**: confirmar que contar desde la confirmación (y no desde el inicio de Plus) es suficiente, y que no hay que extender la ventana.
2. **Devolución total aunque Plus ya haya empezado**: confirmar que no es necesario (ni conveniente) descontar el uso; hoy se devuelve todo.
3. **Plazo de devolución**: si corresponde fijarlo o informarlo.
4. **Orden de revocación** (se revoca el último primero; el anterior queda revocable mientras su plazo corra): confirmar que no restringe el derecho. No se permite revocar un pago anterior con otro posterior ya programado porque dejaría PRO sin pagar en el hueco; resolverlo exigiría tocar el resolver de planes.
5. **Código de arrepentimiento en 24 h** (Res. 424/2020): hoy se muestra en el acto en pantalla; confirmar que alcanza, o si debe enviarse además por email.

## Para habilitar solo transferencia (una vez aprobada la decisión A y con CI verde)

1. Aprobar este PR (la decisión A queda aprobada) y mergearlo: publica los Términos `2026-10-17` junto con el comportamiento.
2. En el entorno del backend, poner `PLAN_CHANGE_TRANSFER_ENABLED=true` y reiniciar. No tocar `PLAN_CHANGE_MP_ENABLED` (queda en `false`).
3. Verificar en `/pro/plan` con un PRO por transferencia de prueba que aparece "Pasar a PRO Plus" y, tras confirmar, el aviso y el botón de arrepentimiento con la fecha de inicio.
