# Precio fundador, semestral y nueva presentación de PRO

Venta de PRO sin presión inventada: lo escaso es real y lo cuenta el backend.

## Precio fundador (`backend/src/plans/founder-price.ts`, migración `ProFounderPrice`)

- `PRO_FOUNDER_SLOTS` (default 30; `0` lo apaga). Un lugar se ocupa con el **primer cobro aprobado** de PRO: el cobro de Mercado Pago que reconcilia `billing-reconciler` o la transferencia que confirma un admin. Pedir un pago, abrir un checkout, una prueba, un bono o un PRO manual/`plan:set` no ocupan lugar.
- Al ocuparlo se guarda `professional_profiles.founder_price_ars` = precio mensual de PRO vigente en ese momento (no el de la bienvenida) y `founder_at`. Serializado con `pg_advisory_xact_lock('pro_founder_seats')`; idempotente.
- `checkoutPrice` (única fuente de Mercado Pago y transferencia) usa `founderAwarePrice`: el menor entre el precio fundador y el vigente. Una suscripción existente ya conservaba su `base_amount`.
- El beneficio queda en la cuenta aunque cancele, vuelva a Free o revoque un pago. Completar los lugares no cambia ningún precio por sí solo: lo escaso es la garantía, no el precio de hoy.
- API: `GET /plans` → `founder { slots, taken, remaining, priceArs } | null`; `/pro/me` → `founderPriceArs`; `/admin/pricing` → `founder`.
- Front: `FounderSeats` (en `PlanOptions`: Mi plan y `/trabaja-con-resuelve`). Muestra el precio que garantizan los primeros lugares, **sin contador ni barra de lugares** (un «Quedan 30 de 30» dice que nadie contrató); sin lugares o apagado no se muestra; a un fundador le confirma su precio y la tarjeta muestra el suyo.
- No hay relleno retroactivo: las cuentas anteriores sin cobro registrado no son fundadoras.

## Semestral por transferencia

`TRANSFER_FREE_MONTHS` en `transfer-rules.ts`: 6 meses se pagan como 5 (`freeMonths` en cada opción). 1 y 3 meses sin cambio. La bienvenida sigue aplicando solo al primer mes. Los pagos ya pedidos conservan su monto.

## Presentación

- Tarjeta PRO en dos grupos: «Que te encuentren primero» (Destacados, fotos en resultados, sin cupo, acceso anticipado con su condición) y «Herramientas para tu trabajo» (30 trabajos, PDF, estadísticas). «Sin permanencia» junto al botón.
- Bienvenida del alta: al final, opcional y sin modal, la prueba de PRO si está disponible o qué falta (foto/canal) para activarla. Nunca precio ni cobro.
- Términos `#pro-pagos` (versión `2026-10-21.2`): precio fundador y 6 por 5.

## Qué no se hace

Contadores regresivos, «últimos lugares» sin número real, PRO marcado por defecto, cobrar por publicar, precios tachados inflados.
