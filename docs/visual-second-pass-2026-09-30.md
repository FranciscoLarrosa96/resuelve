# Resuelve — segunda pasada de escala y densidad

Esta pasada aplica el pedido adjunto del 30 de septiembre de 2026. Reemplaza la composición anterior de destacados, sin cambiar la estructura del hero de Home ni convertir servicios y confianza en tarjetas.

## Cambios

- Escala compartida: `text-xs` pasa a 14/20 px, `text-sm` a 15/22 px y body conserva 16/24 px. Se corrigen tamaños explícitos inferiores a 14 px en las superficies revisadas y en estados, etiquetas, menú, datos del plan y notas del portfolio. Los kickers secundarios conservan 12–13 px.
- Home: servicios de 20 px, descripción de 15 px, matrícula de 14 px; confianza de 18/16 px. Ejemplos y enlaces ganan presencia. El ancho máximo aumenta a 1800 px con padding fluido.
- Servicios: nombres de 19 px, iconos de 24 px y requisito de matrícula visible cuando el catálogo real lo indica. Conserva las filas y usa tres columnas en desktop amplio.
- Destacados de Home: tres columnas de igual proporción cuando caben; dos en ancho intermedio y carrusel táctil en mobile. No hay un primer perfil gigante. Cada perfil muestra avatar, oficio, reputación, disponibilidad, cobertura, trabajos y experiencia cuando existen; agrega descripción y hasta tres servicios reales. Las tarjetas siguen la altura de su contenido. La superficie elevada aporta mayor diferencia de luminosidad en oscuro.
- Resultados y profesionales de Home: avatar Free de 64 px en desktop; nombre y datos más legibles; acciones junto al contenido. PRO presenta descripción y servicios en una sección condicional con divisor, sin reservar un bloque cuando faltan. El destacado tiene retrato mayor, nombre serif, rótulo de promoción y una composición de identidad y evidencia en columnas en desktop amplio. Se elimina el fondo celeste del spotlight y el rail vertical de los PRO normales.
- `Ver perfil`: ojo de 18 px y utilidad compartida `profile-link`, con texto e icono del mismo color, hover de marca y subrayado. Se aplica en destacados, resultados (incluyendo urgencias, que reutiliza ResultCard), comparación y profesionales del detalle de solicitudes. El ejemplo de perfil en PRO usa la misma presentación; sigue siendo una vista previa rotulada.
- Free/PRO: columnas editoriales con precio de 36 px, beneficios de 16 px separados por líneas y un acento lateral de marca en PRO. Sin panel celeste grande, badge flotante ni checklist simétrica. Cada columna mide según su contenido. La tabla conserva todos los valores y gana legibilidad.

## Datos y alcance

Los resúmenes públicos `ProfessionalSummary` no contienen `workPhotos`: no se inventan miniaturas ni se hacen consultas adicionales por profesional. El portfolio real del perfil mantiene su funcionamiento. Se conservan precios, cuotas, ofertas, billing, filtros, selección, ranking, permisos y contratos del backend.

Se ajustan dos pruebas existentes cuya expectativa dependía del ancho anterior y del texto exacto del botón de servicio. Las pruebas funcionales de carga, reintento, navegación y contratación se conservan.

## Verificación y límite pendiente

- Suite frontend: 549 tests correctos en 39 archivos.
- Build de producción correcto, con 24 rutas prerenderizadas.
- `git diff --check` correcto.
- Persisten los avisos de presupuesto existentes del bundle inicial y CSS de Home; no se modifican los presupuestos para ocultarlos.

**No se completó la inspección visual en navegador a 1440/1920 px ni en ambos temas.** El navegador integrado rechazó la dirección local y Computer Use detuvo el control de Chrome porque no pudo determinar la URL activa con suficiente certeza para aplicar su política. No se continuó el control del navegador después de esa detención. La compilación y los tests en jsdom no verifican geometría, contraste renderizado ni legibilidad a escala real. Esa revisión visual queda pendiente; este documento no presenta capturas anteriores como evidencia de esta pasada.
