# Oficios sugeridos

En el primer paso del alta y al editar **Mi perfil → Servicios**, “¿Tu oficio no está en la lista?” permite sugerir un nombre sin seleccionar un rubro incorrecto. Requiere una cuenta, pero no un perfil profesional ni PRO. La sugerencia no publica el perfil, no consume cupos de presupuesto ni agrega servicios automáticamente.

Las especialidades siguen siendo texto del perfil vinculado a un oficio existente. Son distintas de estas propuestas de nuevos oficios del catálogo.

## Administración

**Admin → Oficios** (`/admin/oficios`): pendientes, aprobadas y rechazadas, paginadas de a 25. “Revisar” permite:

- Crear: corregir el nombre, elegir categoría activa y decidir si admite verificar matrícula. Se genera un slug a partir del nombre y se incorpora al catálogo real para todos.
- Vincular: aprobar con un servicio activo existente, sin duplicarlo.
- Rechazar: dejar un motivo visible para quien lo propuso.

No se aprueban dos veces: cada revisión bloquea la fila dentro de una transacción. Las altas de catálogo se serializan y evitan duplicados por nombre normalizado/slug; si ya existe, se debe vincular. Se guardan fecha y administrador de la revisión. Nunca se cambian las matrículas. Los servicios del perfil solo se tocan en un caso: ver «Alta con un oficio sugerido».

## Profesional

En “Tus sugerencias”, **Actualizar estado** consulta el estado persistido. Una aprobada muestra el nombre final y **Elegir [oficio]**, que actualiza el catálogo y lo selecciona en el formulario. En Mi perfil todavía debe guardar los cambios; en el alta debe completar los pasos y publicar. Una rechazada muestra el motivo. La resolución también llega como aviso dentro de la app (ver «Alta con un oficio sugerido»); no hay emails ni push.

Máximo 5 pendientes y 10 envíos cada 30 días por cuenta, controlado en una transacción con bloqueo de la cuenta. Los reintentos de un mismo nombre pendiente (ignorando acentos/mayúsculas/espacios) devuelven la misma propuesta. Nombre de 3–80 caracteres, sin datos de contacto, HTML ni enlaces. El catálogo y el formulario no usan propuestas pendientes como servicios reales.

## API y operación

- `GET /service-suggestions`: hasta 30 propias, primero todas las pendientes y después las revisadas más recientes, sin datos del revisor ni de otras cuentas.
- `POST /service-suggestions { name }`: alta/reintento de una propuesta.
- `GET /admin/service-suggestions?status=PENDING&page=1`: revisión; solo admin (404 al resto).
- `POST /admin/service-suggestions/:id/approve`: `{ serviceId }` o `{ name, categoryId, requiresLicense }`, excluyentes.
- `POST /admin/service-suggestions/:id/reject { reason }`.

Aplicar `ServiceSuggestions1795500000000` en el backend antes de este frontend. No requiere variables nuevas. La baja de cuenta elimina sus propuestas; el borrado definitivo usa CASCADE. El oficio aprobado del catálogo permanece, porque es compartido por todos. La reversión elimina la tabla de propuestas, conservando los oficios creados y los perfiles que los usan.

La búsqueda, el alta, las solicitudes y las páginas de oficios consumen el catálogo existente: no hay una segunda fuente. Los servicios nuevos usan el texto genérico de la landing cuando no tienen una guía editorial específica.

## Alta con un oficio sugerido (hallazgo 10 de la auditoría)

- **Crear el perfil sin servicios.** `POST /pro/profile` acepta `serviceIds: []` solo si la cuenta tiene una sugerencia `PENDING` (si no, 422). El resto del alta (cobertura, titular, años, contacto) se carga igual. `PATCH /pro/profile` sigue exigiendo al menos un servicio.
- **No se publica.** `publicationBlockers` (`professional-rules.ts`, única fuente: `NO_SERVICE`, `NO_COVERAGE`, `PAUSED`) y `HAS_PUBLIC_SERVICE_SQL`: sin un servicio activo el perfil no aparece en la búsqueda (con o sin filtro de servicio), destacados, sitemap ni ficha pública (404, también por enlace) y no puede recibir invitaciones (`SERVICE_NOT_OFFERED`). `/pro/me` trae `publication { published, blockers, pendingSuggestions }`.
- **Al aprobar** (crear o vincular): si el perfil no tenía ningún servicio activo, el oficio se suma solo (mismo lock del perfil, misma transacción); con otros oficios aprobados no se toca nada y el aviso le deja sumarlo. Aprobar solo quita `NO_SERVICE`: cobertura y perfil activo se siguen exigiendo, y el aviso dice si quedó publicado.
- **Avisos in-app** `PRO_SERVICE_SUGGESTION_APPROVED` / `_REJECTED` (migración `ServiceSuggestionNotices1795800000000`, destino Perfil, una por sugerencia, `payload.suggestion` sin PII). Acción visible y ruta: publicado → `/pro/dashboard`; sumado pero con otro requisito pendiente → `/pro/perfil`; sin sumar o rechazado → `/pro/perfil?editar=services` (el rechazo explica el motivo y cómo corregir o elegir otro oficio).
- **Front.** El alta deja seguir con un oficio en revisión ("Crear perfil (sin publicar)"), la bienvenida y el panel dicen "pendiente de publicación" (`PublicationNotice`) y no ofrecen compartir ni la ficha pública. Capturas móviles del recorrido profesional → admin → profesional: `docs/capturas/oficio-sugerido/`.
