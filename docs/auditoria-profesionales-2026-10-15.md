# Auditoría del recorrido profesional · 15 de octubre de 2026

## Alcance y estado real

Revisión del código de fases 3 y 4, comparación de la rama pendiente, navegación pública en producción y pruebas automatizadas. No se alteraron cuentas, pagos ni configuración productiva.

Al iniciar la revisión, `main` estaba en `2fc0f0d` (PR #130): las fases 3 y 4 ya estaban integradas. La rama `claude/fase-3-auditoria-pro-kpj7bq` estaba dos commits por delante: fondo sólido de los botones de portada y orden de recomendaciones iniciales. La continuación conserva ambos commits y agrega los cambios de esta auditoría.

## Decisiones de producto

- Se conserva la prueba opt-in de 14 días, una vez por cuenta, Free después del primer cliente, sin tarjeta y excluyendo a quien ya pagó PRO. Se ofrece en Tu mes y en la solicitud que llegó tarde. Los días usan `bonus_pro_until`; no se agregó otra fuente de plan.
- El usuario eligió permitir **especialidades propias dentro de un servicio existente**. Disponibles para Free y PRO en alta y edición. No se crean rubros públicos automáticamente.
- Se conservan fotos en resultados solo para PRO y resumen semanal in-app/push. La ventaja “antes que Free” se comunica solo con la marca del backend para esa solicitud.

## Hallazgos y cambios

| Prioridad | Problema | Resultado |
|---|---|---|
| Alta | El alta no ofrecía una salida para nombres específicos fuera del catálogo. | Editor único de especialidades en alta y Mi perfil; guardado y lectura públicos. Hasta cinco por rubro, sin contacto ni enlaces. |
| Alta | “La demanda en tu zona” comparaba la ciudad principal con solicitudes recibidas en todas las ciudades. | `localDemand.received` cuenta solo invitaciones disponibles de los mismos pedidos usados en la demanda. El frontend no usa el total global como reemplazo. |
| Alta | La ausencia de una muestra suficiente se interpretaba como poca demanda y como causa de la falta de acceso anticipado. | Mensaje basado en el registro disponible, sin afirmar volumen ni causalidad. |
| Media | Al vencer la prueba podía abrirse un modal de contratación aunque la cuenta ya tuviera PRO por otra fuente. | Se muestra automáticamente solo sin PRO vigente. El acceso efectivo sigue saliendo del store/entitlements. |
| Media | Las recomendaciones desaparecían con fotos de trabajos y reseñas aunque faltaran foto personal o contacto. | Se muestran los faltantes; Compartir queda al final cuando están las señales de presentación. Ocultar sigue disponible. |
| Media | “Cómo funciona” en la página para profesionales resolvía a `/#como-funciona`, fuera de la página. | Enlace Angular al fragmento de `/trabaja-con-resuelve`. |
| Media | La presentación pública priorizaba presupuestos sobre el contacto directo. | Presentación con trabajos, WhatsApp, llamadas y solicitudes. Los canales siguen siendo Free. |
| Media | Los botones de portada se perdían sobre fotos oscuras en mobile. | Se conserva el fondo sólido pendiente y se amplían las áreas táctiles a 44 px; el contenedor permite envolver los botones. |
| Baja | El buscador del alta no compartía el vocabulario del catálogo usado en otras pantallas. | Reutiliza `searchServices` y sus alias. |

## Especialidades: contrato y compatibilidad

Migración **nueva** `1795200000000-ServiceSpecialties`: `professional_services.specialties text[]`, no nulo, vacío por defecto y límite de cinco elementos.

`POST/PATCH /pro/profile` acepta `specialties: [{ serviceId, names }]`. Cada entrada modifica ese rubro; omitirlo lo conserva, `names: []` lo limpia y quitar el rubro elimina sus especialidades. Se valida que sea un servicio ofrecido. No cambia categorías, licencias, matching, ranking ni elegibilidad PRO. Las modificaciones concurrentes de perfil se serializan con su lock. La baja de cuenta limpia el texto.

El campo público es `services[].specialties`, también disponible en `offeredServices` para el dueño. Los modelos del frontend lo toleran ausente al recibir una versión anterior de la API.

**Orden de publicación cuando se apruebe el PR:** migración y backend, luego frontend. No hubo despliegue en esta revisión. Volver el frontend atrás no elimina datos. Revertir la migración elimina el campo nuevo: requiere respaldo si ya se usó.

## Validación y límites

- Frontend: 896 tests aprobados, incluyendo especialidades, diagnóstico, resumen de prueba y el editor integrado en alta/perfil.
- Backend: 322 tests unitarios aprobados; lint y tipos aprobados.
- Builds de frontend y backend aprobados. Frontend conserva avisos de presupuesto de bundle inicial y CSS de Home; no bloquean el build.
- Metadata: 24 tests aprobados.
- La migración nueva pasó aplicar → revertir → aplicar en PGlite y en PostgreSQL 16 real de GitHub Actions.
- PostgreSQL nativo no estuvo disponible en este entorno. PGlite permitió ejercitar alta/edición de especialidades, pero el adaptador de conexiones cortó operaciones y no validó las suites de integración completas. Esos intentos no se consideran aprobación.
- Se agrega verificación de PR con PostgreSQL 16 real, migraciones y todas las suites. La primera ejecución aprobó 826/827 tests: el test de rollback de urgencias contaba ocho migraciones posteriores de forma fija. Se corrigió para revertir hasta `PermanentUrgencies` por nombre, incluyendo cualquier migración nueva; sin modificar migraciones ya publicadas. Consultar el resultado final en el PR antes de mergear.
- La navegación autenticada en producción quedó pendiente de completar el acceso seguro del usuario. No se verificó visualmente la versión nueva a 390/1024/1440 ni se certificó axe/consola limpios: el navegador remoto no pudo acceder al servidor local.

## Lectura comercial

La propuesta de PRO tiene beneficios observables: visibilidad identificada, fotos en resultados, más trabajos y métricas. Los contactos directos, la reputación y las especialidades siguen dando utilidad al plan gratuito. La prueba y los resúmenes muestran actividad propia sin prometer clientes ni atribuir resultados al pago.

Para evaluar si esto convierte, medir por cohorte: oferta de prueba → activación → actividad durante la prueba → visita al resumen → contratación → renovación. Separar profesionales con demanda suficiente de quienes aún no tuvieron exposición. Una prueba sin movimiento necesita diagnóstico y acciones útiles; no más presión comercial ni números inventados.

La siguiente revisión debe hacerse con un perfil Free y uno PRO en un entorno con datos reales o fixtures controlados: alta con especialidad, foto, primer trabajo, contacto, primera reseña, compartir, solicitud demorada, consumo Free, prueba y final de prueba. No conviene agregar otra fase comercial antes de comprobar este recorrido.
