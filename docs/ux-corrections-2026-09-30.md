# Correcciones de UX — 30 de septiembre de 2026

Se ajustaron las pantallas señaladas en las siete capturas, manteniendo la identidad Petrol / Arcilla y la arquitectura actual.

## Cambios

- **Sidebar y selector de modo:** el selector ocupa el ancho disponible, sus columnas pueden encogerse y conserva áreas de interacción de 44 px. Los iconos se omiten en esta variante compacta para que ambos textos entren. La variante del header conserva su presentación. Se corrigió la causa del desborde, sin ocultar el scroll del documento.
- **Coordinación de trabajos:** sección abierta con divisores, campos alineados y etiquetas asociadas al input visible de Flatpickr. Horario y duración siguen siendo opcionales. Guardar tiene una fila propia; cancelar conserva su confirmación existente.
- **Perfil → presupuesto:** una visita independiente inicia una solicitud vacía y conserva al profesional como destinatario. Primero se elige el servicio; no se heredan problema, barrio, urgencia o fecha de un borrador anterior.
- **Pedido en curso:** los enlaces desde resultados y comparación llevan un contexto explícito. En ese recorrido se conserva el pedido que el usuario está preparando, sin obligarlo a escribir todo otra vez.
- **Urgencias:** la entrada general consulta todos los profesionales disponibles hoy, sin recuperar el oficio de un pedido anterior. Los filtros pasan de pills a opciones de texto con indicador de selección, incluyen Todos y mantienen la búsqueda de Otro servicio. Las entradas desde una solicitud en curso preservan su contexto explícito.
- **Destacado PRO:** se eliminó el rail izquierdo; la distinción usa superficie Petrol suave, mayor jerarquía y la identificación de espacio promocionado pago. Se conserva el significado de mayor visibilidad, sin insinuar mayor calidad.
- **Vitrina PRO:** hover de hasta 2 px, avatar con variación mínima y avance de la flecha de 3 px. Los nombres pueden ocupar más de una línea.
- **Scroll:** directiva reutilizable de entrada única en secciones de Home y perfil público. Las secciones inicialmente visibles aparecen inmediatamente. Las siguientes entran al acercarse al viewport, sin animación repetida. SSR y navegadores sin soporte mantienen el contenido visible.

## Motion y accesibilidad

Se reutilizan los tokens de duración y easing existentes: microinteracciones y componentes breves, entrada de vista de 260 ms y desplazamiento de 8 px. `prefers-reduced-motion` elimina estos movimientos. Se conserva feedback por color, navegación por teclado y foco visible. No se añadieron dependencias.

## Validación

- `npm test -- --watch=false`: **517 tests aprobados en 36 archivos**. Incluye regresiones del borrador obsoleto y de la continuación explícita del pedido.
- `npm run build`: **correcto**, con SSR y 23 rutas prerenderizadas.
- TypeScript con `tsc -p tsconfig.app.json --noEmit`: correcto.
- El proyecto no tiene script de lint.
- Navegador: 60 combinaciones de seis pantallas, temas light/dark y anchos 390, 768, 1024, 1440 y 1720 px. Sin desborde horizontal del documento, sidebar o selector y sin errores de página.
- Interacciones verificadas: filtro general, selección y limpieza del servicio, solicitud nueva desde perfil con borrador anterior, entrada al scroll, hover, movimiento reducido y guardado de agenda con horario vacío.
- Las verificaciones de navegador usan respuestas API controladas; no crean solicitudes ni modifican trabajos reales.

El build conserva el warning existente del presupuesto inicial de 520 kB: total 549,93 kB. No se aumentó el límite para ocultarlo. Backend, contratos, estados de trabajos y reglas de contratación permanecen sin cambios.
