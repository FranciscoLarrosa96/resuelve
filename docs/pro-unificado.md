# Un único Resuelve PRO

Desde el 21/10/2026 la oferta pública es Gratis y PRO. PRO incluye 30 trabajos, 5 fotos por trabajo, hasta 3 fijados, antes/después, portada, PDF de presupuestos propios y CSV de Tu mes, además de los beneficios previos. Pruebas y bonos PRO tienen esos mismos permisos mientras estén vigentes. No cambia el cupo Free ni las reglas de Destacados.

Mi plan permite alternar Gratis/PRO sobre los datos propios sin activar ni modificar el plan. Usa fotos propias guardadas cuando existen; las muestras se identifican como Ejemplo. No inventa reseñas ni promete clientes o posiciones.

## Compatibilidad y cobros

- `effectivePlan` presenta todo acceso pago vigente como PRO. `PRO_PLUS` sigue siendo válido internamente para registros, períodos, precios históricos, conciliación, cancelación y devoluciones. No se reescribe ninguna fila ni se ejecuta una migración.
- Un Plus vigente conserva todas sus herramientas, sus trabajos y sus fechas. El nombre público pasa a PRO; el importe de su suscripción no se cambia automáticamente. Cualquier ajuste de esas condiciones necesita un trabajo comercial y de facturación separado.
- `/plans` solo publica PRO. Checkout y transferencia públicos normalizan solicitudes antiguas `plan: PRO_PLUS` a una nueva compra PRO con el precio PRO vigente del servidor. Ningún precio viaja desde el navegador.
- No se ofrecen nuevas mejoras Plus: status devuelve `plusCheckoutPrice: null` y `planChangeOptions: null`, transferencia devuelve `plusOptions: []` y `scheduledPlus: false`, y POST plan-change responde PLAN_CHANGE_NOT_AVAILABLE incluso con flags históricos activos.
- Los cambios ya solicitados conservan su conciliación, estado, importe y opción de descartarlos. Sus períodos y devoluciones siguen administrándose. El historial de precios Plus permanece disponible solo en administración para interpretar cobros anteriores.
- El precio público sigue viniendo del panel administrador. Cambiar el precio PRO afecta compras nuevas según las reglas existentes, sin modificar las suscripciones ya contratadas.

## Verificación

Las pruebas de planes cubren equivalencia PRO/Plus y fuentes manual, cobro, transferencia y bono. Los e2e conservan fixtures Plus históricos para verificar importes, conciliación, períodos futuros, cancelación y devolución; los endpoints públicos se prueban por separado con la oferta unificada. La vista previa prueba ambos modos sin escrituras, con fotos de ejemplo identificadas.
