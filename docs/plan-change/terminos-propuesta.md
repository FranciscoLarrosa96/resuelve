# Cambio de plan PRO → PRO Plus: propuesta de texto (BORRADOR PARA REVISIÓN)

> **No está publicado** ni es definitivo. No se cargó en `/terminos` ni en la Política de Privacidad.
> No es una interpretación legal: cada punto marcado **[DECIDIR]** necesita una definición de quien
> tenga la responsabilidad comercial y legal antes de publicarlo y de encender los flags
> `PLAN_CHANGE_TRANSFER_ENABLED` / `PLAN_CHANGE_MP_ENABLED`. Si se aprueba, iría como una subsección
> nueva de `#pro-pagos` (y `TERMS_VERSION` del front / `CURRENT_TERMS_VERSION` del backend cambiarían juntos).

## Propuesta de texto

### Cambio de PRO a PRO Plus

**Qué es.** Si tenés Resuelve PRO pago, podés pedir pasar a Resuelve PRO Plus a partir del período siguiente, sin cancelar primero. Solo se puede pasar de PRO a PRO Plus; el camino inverso no está incluido.

**Inicio.**
- *Mercado Pago:* seguís con PRO durante el período que ya pagaste. PRO Plus empieza cuando se aprueba el primer cobro con el precio de PRO Plus. La fecha de ese cobro la define Mercado Pago; la que te mostramos es una previsión.
- *Transferencia:* PRO Plus empieza cuando termina el PRO que ya pagaste. Si confirmamos tu pago después de esa fecha, empieza al confirmarlo y no se descuentan días anteriores a la confirmación.

**Cobro.** El día que pedís el cambio no se cobra nada ni se descuenta nada de lo ya pagado. El precio de PRO Plus es el vigente cuando pedís el cambio y se informa antes de que confirmes. No hay prorrateo: no se cobra ni se acredita parte de un período.

**Renovación.** Con Mercado Pago, desde el cobro de PRO Plus la suscripción se renueva cada mes a ese precio hasta que dejes de renovar. Con transferencia no hay renovación automática.

**Si el cobro no se aprueba.** PRO Plus no se activa. Tu acceso a PRO sigue las condiciones vigentes de tu suscripción.

**Descartar el cambio.** Podés descartarlo antes de que PRO Plus empiece. Con Mercado Pago, el descarte no es inmediato: hasta que el proveedor confirme que volvió al monto anterior, te lo indicamos como "en curso".

**Cancelar la renovación.** Cancelar la renovación da de baja la suscripción y descarta un cambio pendiente. Conservás el acceso hasta el final del período pagado.

**Cobros que coinciden con una cancelación o un descarte.** **[DECIDIR D]** Si un cobro con el precio de PRO Plus se procesa al mismo tiempo que cancelás la renovación o descartás el cambio: *(opción 1)* se devuelve; *(opción 2)* se acredita contra el próximo período; *(opción 3)* se otorga PRO Plus por el período cobrado. El texto definitivo depende de cuál se elija.

**Arrepentimiento y devoluciones.** **[DECIDIR A, B]** Ver abajo.

## Decisiones pendientes (sin asumir una interpretación legal)

| # | Tema | Estado actual del código | A decidir |
|---|---|---|---|
| A | Arrepentimiento en transferencia | Los 10 días corren desde la confirmación de cada pago, aunque el Plus programado empiece después | ¿Corren desde la confirmación o desde que PRO Plus empieza? ¿Qué se devuelve si se arrepiente antes de que empiece (el pago de Plus, no el PRO ya vigente)? |
| B | Arrepentimiento en Mercado Pago | La ventana cuenta desde la autorización original y el cambio no la reabre; revocar devuelve los cobros aprobados dentro de la ventana | ¿El primer cobro de PRO Plus abre una ventana propia? ¿Se devuelve solo ese cobro? |
| C | Términos | `#pro-pagos` no describe el cambio de plan | Aprobar o ajustar el texto de arriba y la versión de Términos |
| D | Cobro de Plus concurrente con cancelar la renovación / descartar el cambio | Se registra el monto, no se da Plus ni se devuelve; queda en el log para revisión manual (ver `backend/README.md`) | Devolver, acreditar u otorgar Plus por ese período |
| E | Cobro de Plus mientras el cambio se descarta | Plus se activa (manda lo efectivamente cobrado) | Confirmar ese criterio o exigir devolución |
| F | Margen de 24 h antes del cobro de Mercado Pago | Provisorio (`PLAN_CHANGE_MIN_HOURS_BEFORE_CHARGE`) | Contrastarlo con el comportamiento real del proveedor en sandbox |
| G | Comportamiento de Mercado Pago al cambiar el monto | No validado (la documentación no lo dice) | Probar en sandbox: sin cobro inmediato, rige desde el próximo cobro, sin reautorización |
