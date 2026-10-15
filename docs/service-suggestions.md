# Oficios sugeridos

En el primer paso del alta y al editar **Mi perfil → Servicios**, “¿Tu oficio no está en la lista?” permite sugerir un nombre sin seleccionar un rubro incorrecto. Requiere una cuenta, pero no un perfil profesional ni PRO. La sugerencia no publica el perfil, no consume cupos de presupuesto ni agrega servicios automáticamente.

Las especialidades siguen siendo texto del perfil vinculado a un oficio existente. Son distintas de estas propuestas de nuevos oficios del catálogo.

## Administración

**Admin → Oficios** (`/admin/oficios`): pendientes, aprobadas y rechazadas, paginadas de a 25. “Revisar” permite:

- Crear: corregir el nombre, elegir categoría activa y decidir si admite verificar matrícula. Se genera un slug a partir del nombre y se incorpora al catálogo real para todos.
- Vincular: aprobar con un servicio activo existente, sin duplicarlo.
- Rechazar: dejar un motivo visible para quien lo propuso.

No se aprueban dos veces: cada revisión bloquea la fila dentro de una transacción. Las altas de catálogo se serializan y evitan duplicados por nombre normalizado/slug; si ya existe, se debe vincular. Se guardan fecha y administrador de la revisión. Nunca se cambian automáticamente las matrículas ni los servicios del perfil.

## Profesional

En “Tus sugerencias”, **Actualizar estado** consulta el estado persistido. Una aprobada muestra el nombre final y **Elegir [oficio]**, que actualiza el catálogo y lo selecciona en el formulario. En Mi perfil todavía debe guardar los cambios; en el alta debe completar los pasos y publicar. Una rechazada muestra el motivo. No se envían emails ni push sobre esta revisión.

Máximo 5 pendientes y 10 envíos cada 30 días por cuenta, controlado en una transacción con bloqueo de la cuenta. Los reintentos de un mismo nombre pendiente (ignorando acentos/mayúsculas/espacios) devuelven la misma propuesta. Nombre de 3–80 caracteres, sin datos de contacto, HTML ni enlaces. El catálogo y el formulario no usan propuestas pendientes como servicios reales.

## API y operación

- `GET /service-suggestions`: las últimas 30 propias, sin datos del revisor ni de otras cuentas.
- `POST /service-suggestions { name }`: alta/reintento de una propuesta.
- `GET /admin/service-suggestions?status=PENDING&page=1`: revisión; solo admin (404 al resto).
- `POST /admin/service-suggestions/:id/approve`: `{ serviceId }` o `{ name, categoryId, requiresLicense }`, excluyentes.
- `POST /admin/service-suggestions/:id/reject { reason }`.

Aplicar `ServiceSuggestions1795500000000` en el backend antes de este frontend. No requiere variables nuevas. La baja de cuenta elimina sus propuestas; el borrado definitivo usa CASCADE. El oficio aprobado del catálogo permanece, porque es compartido por todos. La reversión elimina la tabla de propuestas, conservando los oficios creados y los perfiles que los usan.

La búsqueda, el alta, las solicitudes y las páginas de oficios consumen el catálogo existente: no hay una segunda fuente. Los servicios nuevos usan el texto genérico de la landing cuando no tienen una guía editorial específica.
