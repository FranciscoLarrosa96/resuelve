# RESUELVE — corrección de fechas y pulido de la dirección aprobada

## Fallos corregidos

`jobDate()` construía una fecha agregando `T12:00:00` a `scheduledDate`. Un valor ya serializado como ISO producía una fecha inválida: `Intl.DateTimeFormat` lanzaba `RangeError` durante el render. Esto explica que el detalle quedara incompleto y que el formulario de reseña pudiera funcionar mientras el resto de la vista se interrumpía.

La presentación acepta fechas cortas e ISO, valida el día y muestra «Fecha no disponible» ante un valor inválido. Conserva el día de calendario del trabajo; no convierte una fecha de agenda a otro día por el huso horario. Se aplica al detalle cliente, etiquetas de trabajos, Agenda, encabezados del dashboard y precarga del formulario de coordinación. El historial también evita formatear timestamps inválidos.

Dos regresiones renderizan el detalle completo, abren «Dejar reseña», publican un único POST y comprueban el agradecimiento con fecha ISO o inválida. La prueba de Agenda combina fechas cortas e ISO y verifica agrupación, orden por hora, trabajos de hoy y prioridad de coordinación.

## Ajustes por pantalla

| Pantalla | Cambio |
| --- | --- |
| Home / destacados | Conserva el perfil principal y dos acompañantes. Reduce padding, separación y alto del retrato principal para compactar el conjunto. Corrige el token de texto del indicador móvil. |
| Mis solicitudes | Amplía el límite a 1440 px y usa dos columnas en desktop amplio, con filas abiertas y filtros existentes. |
| Detalle cliente | Estado, reseña y presupuestos ocupan la columna principal. Pedido y participantes pasan al contexto lateral en desktop; mobile conserva el orden de lectura. |
| Agenda | Revisar vencidos y coordinar preceden a Hoy y Próximos. Coordinación ocupa el ancho disponible. El historial queda subordinado. Corrige un desborde encontrado a 390 px. |
| Trabajo profesional | Cliente, presupuesto, checklist, notas e historial usan secciones con divisores en lugar de cinco cajas. Más ancho útil y columnas proporcionadas. |
| Dashboard vacío | Accesos a revisar perfil y trabajos, ver perfil público y estadísticas. Los indicadores siguen usando datos reales. |
| Estadísticas | Seis pasos: apariciones, visitas, solicitudes, presupuestos, aceptados y realizados. Conexión horizontal en desktop y vertical en mobile. Elimina la equivalencia con el precio de PRO y mantiene la explicación del valor aceptado. |

## Sistema y límites

Se conserva petrol, arcilla, neutros, tipografía y distinción Free / PRO / destacado. No se añaden fotos de portfolio: el resumen de destacados no ofrece ese contenido y no se inventan imágenes ni se crean consultas adicionales por perfil. El selector de contexto existente ya marca el modo actual con icono, color y `aria-current`, y diferencia el enlace alternativo con una flecha y nombre accesible.

Los ajustes usan tokens y controles existentes. Se elimina la entrada decorativa de las métricas. Las transiciones de datos conservan el tratamiento de `prefers-reduced-motion`; las pruebas existentes de movimiento reducido siguen pasando. No se cambian backend, endpoints, contratos, ranking, estados, permisos, precios ni límites.

## Verificación realizada

- Suite frontend: **549 tests correctos, 39 archivos**.
- Después del último ajuste de enlaces del dashboard y limpieza del diff: **23 tests de dashboard/reseñas correctos**.
- Metadata de perfiles públicos: **6 tests correctos**.
- Build de producción correcto, **24 rutas prerenderizadas**.
- `git diff --check` correcto.
- Navegador: HTML y estilos de componentes Angular reales, renderizados con fixtures locales de los tests, sin publicar reseñas ni modificar solicitudes reales.
- Destacados, detalle cliente, Agenda y estadísticas: **390, 768, 1024, 1440 y 1920 px, claro y oscuro**. Sin desborde de página después de corregir Agenda y reproducir el padding responsive de Home en el harness.
- Metadata visible (`text-muted`, `text-ink-soft`, notas del recorrido): contraste mínimo medido **4,56:1 en claro** y **6,15:1 en oscuro** en los fixtures revisados. Esto no constituye una certificación integral de accesibilidad.

La matriz visual nueva cubre esos cuatro componentes, no todas las rutas autenticadas en producción ni todos sus estados con datos reales. Dashboard, lista cliente y detalle de trabajo tienen verificación de código/compilación; las verificaciones anteriores están documentadas en `visual-polish.md` y `ux-corrections-2026-09-30.md`. No se presenta esa revisión anterior como una nueva prueba completa de todas las rutas.

El build mantiene dos avisos de presupuesto: bundle inicial **543,83 kB / 520 kB**, y CSS de Home **6,27 kB / 4 kB**. No se aumentaron los límites para ocultarlos. La suite en jsdom avisa que `scrollTo` no está implementado; las pruebas pasan.
