# Prioridades altas: búsqueda local y valor comercial

## Ubicación voluntaria

El selector global de ciudad ofrece «Usar mi ubicación» solo cuando el navegador lo soporta y `/location/config` confirma un proveedor disponible. Nunca pide permiso al cargar. Usa los servicios existentes: lectura puntual → reverse por POST → id de localidad sugerida → detalle del catálogo → confirmación explícita con localidad y provincia. Solo la confirmación cambia y recuerda la localidad como cualquier elección manual.

No guarda coordenadas ni dirección. Un cambio de localidad durante la consulta o cerrar el diálogo invalida la respuesta pendiente. El selector manual sigue disponible ante permiso denegado, falta de coincidencia inequívoca, timeout o error del proveedor. No agrega detección por IP ni ordenamiento por distancia ni cambia cobertura profesional. La política de privacidad describe el uso en búsqueda.

Requiere el proveedor existente `LOCATION_PROVIDER=google` y su clave configurada en el backend. Este trabajo no cambia configuración ni despliega servicios. Sin proveedor, se conserva la búsqueda manual; no se simula detección. Comprobar disponibilidad en producción es independiente de las pruebas mockeadas.

## Presentación y perfil

`PlanUseCases` se comparte entre la landing profesional y Mi plan Free: ejemplos concretos de Gratis, PRO y Plus, sin prometer resultados ni mover herramientas entre planes. Precios y prestaciones se mantienen. La bienvenida publicada muestra los datos reales, acceso al perfil como cliente y compartir/copiar existentes (sin repetir el botón si Compartir ya era el próximo paso). Perfiles pausados o pendientes no se ofrecen para compartir. Mi perfil ya contiene vista previa, enlace público y compartir; se conserva esa implementación.

## Medición de actividad por localidad

`cd backend && npm run build && npm run local:report -- --from 2026-10-01 --to 2026-11-01`

Reporte JSON agregado, de solo lectura, sin consultas automáticas a producción. Fin exclusivo, fechas de Argentina. Usa hechos existentes y no agrega eventos ni migraciones:

- Apariciones de tarjetas, visitas, toques WhatsApp/Llamar: localidad demostrable por el barrio del evento; sin barrio, `SIN_LOCALIDAD`. No se adivina por cobertura ni por la ciudad del profesional. Apariciones **no son cantidad de búsquedas**.
- Pedidos enviados: primera invitación del período. Aceptados y realizados de esos pedidos: estado al consultar. No cuenta borradores.
- Vistas/clics del plan, checkout, cobro aprobado y renovación: profesionales distintos en cada hecho durante el período, PRO y Plus. Localidad principal **actual** del profesional, no geolocalización ni ciudad histórica del cobro. No mezclar con la localidad de búsqueda del cliente.
- No reconstruye un embudo causal entre estas poblaciones ni calcula tasas entre ellas. El histórico sin localidad no es cero. `marketplace:report` conserva ventanas de respuesta y desgloses; `funnel:report` conserva la cohorte profesional y tasas. Para medir búsquedas completas por localidad haría falta instrumentación nueva: se declara la limitación en lugar de inventarla.

Quedan fuera: asistente WhatsApp, convenios con comercios, video, nuevos precios/planes anuales y campañas o contactos externos.
