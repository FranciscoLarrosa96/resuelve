# Avisame cuando haya

Cuando un cliente busca un servicio en una localidad sin profesionales, los resultados muestran
«¿Querés que te avisemos?». Con sesión, un botón guarda el aviso; sin sesión, lleva a ingresar y
vuelve a la misma búsqueda.

## Regla (`backend/src/demand-alerts/demand-alerts.ts`, única fuente)

- Una fila en `demand_alerts` por persona, localidad y servicio. Pedirlo de nuevo es idempotente;
  si ya se había avisado, se reactiva (un aviso nuevo, sin duplicar el anterior).
- Hay oferta cuando la búsqueda pública la mostraría: perfil `ACTIVE`, servicio activo y cobertura
  de la localidad (toda la ciudad o algún barrio activo). Un perfil pausado no cuenta.
- `DemandAlertsScheduler` revisa cada 15 minutos y crea **un** aviso `CLIENT_DEMAND_ALERT_MATCHED`
  (in-app; push y email por los canales de siempre, sin el servicio ni la localidad en el texto).
  El aviso lleva a `/profesionales?servicio=…&provincia=…&ciudad=…`.
- No es un pedido de presupuesto: no se manda a ningún profesional ni tiene texto libre.
- Baja de cuenta: se borran sus avisos (y CASCADE al borrar el usuario).

## Medición

`npm run local:report` suma `demandAlertsRequested` por localidad y lista en `waiting` cuántas
personas siguen esperando cada servicio en cada localidad: sirve para saber qué oficios sumar.

## API

- `GET /me/demand-alerts?cityId&serviceId` → `{ active }`.
- `POST /me/demand-alerts { cityId, serviceId }` → `{ active: true }` (404 si la localidad o el
  servicio no existen o no están activos).

Está en la Política de Privacidad (`#avisame`). Migración `DemandAlerts`.
