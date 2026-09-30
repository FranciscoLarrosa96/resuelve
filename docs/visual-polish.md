# Pulido visual de Resuelve

## Auditoría previa — 30 de septiembre de 2026

Referencias: código Angular/Tailwind existente, manual v1 y recorrido de 3:11
(`demo-resuelve.mp4`, revisado mediante fotogramas cada dos segundos).
La nueva dirección del pedido tiene prioridad sobre Forest del manual.
El video muestra desktop y un cambio a oscuro; no acredita mobile ni todos los estados.

### Sistema encontrado

- `src/styles.css`: tokens de superficies, texto, marca, estados, agenda, radios,
  sombras, esqueletos y movimiento. Tailwind 4 consume esa API semántica.
- Source Serif 4 y Archivo ya están instaladas. Hay tamaños arbitrarios y serif
  en títulos operativos pequeños que no requieren una voz editorial.
- Botones e inputs repiten clases en templates; ChipDirective centraliza selección.
- Tag, StatusPill, ProBadge, FeaturedLabel, Avatar, Dialog, Toast, WorkGallery y
  AvailabilitySwitch ya ofrecen primitivas útiles: se conservan y refinan.
- Header cliente, navegación inferior y sidebar profesional comparten stores y
  menú de cuenta. El activo de sidebar depende de una superficie blanca completa.
- ResultCard y ResultCardMobile duplican estructura: presupuesto, perfil y
  checkbox compiten; subtítulos se truncan. Destacado depende de
  `isFeaturedPlacement`, distinto de `pro`, reputación y verificación.
- CompareTray usa el store persistido y límite real de seis. Su alto y varios
  contenedores compiten con los resultados. Se preserva el pedido múltiple.
- Home tiene composición abierta útil; el buscador y el portfolio público son
  bases a conservar. Se detectaron pulsos decorativos de disponibilidad/urgencia.
- Dashboard tiene franja útil de trabajo y listas reales; el resumen mensual
  anida pequeñas cards. Analytics ya cuenta con gráficos sobrios y tabla accesible.
- Perfil privado, solicitudes y detalles usan demasiados bloques enmarcados.
- Agenda posee grilla real, inspector y layout móvil específico: conservarlos.
- Dark mode ya funciona sin flash, pero carece de un token de superficie elevada
  y aún mezcla marca y éxito. ThemeStore/index/manifest replican color de canvas.
- Diálogo nativo conserva foco, Escape e inercia. Menús y formularios tienen
  accesibilidad existente que debe mantenerse; focus e hit areas requieren revisión.
- Colores literales de UI mayormente centralizados; quedan sombras arbitrarias,
  theme-color y assets históricos. Radios incluyen excepciones de 5/6/14/22 px.

### Dirección de implementación

Petrol para identidad y acciones; arcilla controlada; neutros cálidos; verde
exclusivamente para disponibilidad y confirmación. Tokens de marca para texto
y relleno separados, especialmente en oscuro, donde el petrol sugerido no debe
usarse sin comprobar contraste en texto pequeño.

Primitivas CSS compartidas para botones, campos, secciones de trabajo y selección.
Resultados en composición responsive compartida; destacado con superficie de
marca, rail y explicación visible de promoción paga. Comparación compacta con
nombres, cantidad y siguiente paso. Sidebar activa mediante rail. Métricas
subordinadas al trabajo y resumen mensual legible, sin inventar datos.

### Límites deliberados

Sin cambios a endpoints, modelos, reglas de elegibilidad, ranking, billing,
precios, límites, persistencia, privacidad o cálculos de analytics. Sin nuevas
dependencias de animación, fotografías inventadas ni identidad PRO independiente.

### Base de validación

- Frontend: 33 archivos y 500 tests correctos antes de modificar.
- Build production correcto; warning previo de bundle inicial: 536,35 kB frente
  al límite informativo de 520 kB. No aumentar budgets para ocultarlo.
- No existe script de lint frontend en package.json.
- Tests/build repetidos después de los bloques de sistema y pantallas; resultados
  finales detallados abajo.

## Entrega

### 1. Dirección visual

Petrol como identidad, arcilla para urgencia y acentos puntuales, neutros cálidos
como base. Verde reservado a disponibilidad, confirmación y éxito. Source Serif 4
conserva la voz editorial; Archivo domina controles, metadata y secciones de trabajo.
Se conserva el símbolo casa/check, ahora plano y petrol, incluyendo favicons y PWA.

### 2. Componentes y primitivas

- `ResultCard` comparte template y CSS responsive entre los selectores desktop y
  mobile existentes. Se elimina la implementación duplicada de `ResultCardMobile`.
- `FeaturedLabel`, `ProBadge`, `CompareTray` y comparador reciben jerarquía nueva.
- Header cliente, shell/sidebar profesional y menú de cuenta adoptan las mismas
  superficies, indicadores y controles.
- Utilidades `button-primary`, `button-secondary`, `field-control`, `work-section`
  y `selection-control` centralizan variantes repetidas sin crear componentes vacíos.
- `TabsDirective` añade foco itinerante, flechas, Home/End y omisión de botones
  deshabilitados; selección sigue a cargo de los stores actuales.
- Se refinan Dialog, Toast, ServicePicker, ChipDirective, AvailabilitySwitch,
  WorkGallery, medidor de cupo y diálogos de límites/instalación.
- Botones/campos compartidos se propagan a solicitudes cliente/profesional,
  presupuestos, onboarding y administración de matrículas.

### 3. Tokens

La API semántica existente de Tailwind se mantiene; cambian sus valores en un
único sistema (`src/styles.css`). No se agrega una paleta paralela en componentes.

| Token | Claro | Oscuro |
| --- | --- | --- |
| canvas | #F7F3EB | #101615 |
| surface | #FFFDF9 | #171E1D |
| surface-elevated, nuevo | #FFFDF9 | #1E2826 |
| brand, texto | #1D4F5C | #79B0BC |
| primary, relleno | #1D4F5C | #2A6B79 |
| brand-soft | #E6EFF0 | #18333A |
| accent | #A85432 | #C97C58 |
| ink | #1D2423 | #F1EEE6 |
| muted/subtle | #606B67 | #AAB2AD |
| line | #D8D2C7 | #303A37 |
| success | #2F6D52 | #65A47F |
| success-soft, nuevo | #E5EFE8 | #1C3227 |
| success-strong, nuevo | #24553F | #95C7A9 |
| on-success, nuevo | #FFFDF9 | #101615 |

También se añaden success-line, tonos de paleta brand-900/700/600/100,
text-ui-title (18/24), text-page-title (32/38), text-editorial-title (40/44),
duration-micro/component/view (160/200/260 ms). Radios md/lg/xl/2xl/3xl:
6/8/10/12/16 px. Sombras flotantes y modales más contenidas.
El gris sugerido se oscurece ligeramente porque sobre Sand y Brand 100 quedaba
por debajo de 4,5:1; el petrol de texto oscuro se aclara por el mismo motivo.

### 4. Cambios por pantalla

| Pantalla | Cambio relevante |
| --- | --- |
| Home | Conserva composición y titular; ajusta densidad, buscador elevado, alineación y títulos operativos. Elimina pulsos decorativos. |
| Profesionales | Nombre/oficio/experiencia legibles, reputación y trabajos reales, señales inline, acción principal única y perfil terciario. En mobile metadata aprovecha todo el ancho. |
| Comparación | Barra compacta con cantidad, nombres, quitar/limpiar y próximo paso; conserva presupuesto múltiple y comparador real. |
| Dashboard | Métricas en franja abierta; solicitudes y próximos trabajos como secciones de trabajo; resumen mensual subordinado. |
| Sidebar | Rail activo, fondo leve, grupos y jerarquía; conserva disponibilidad, cuenta y cambio de modo. |
| Solicitudes | Lista continua, selección con rail y fondo; inspector elevado; pestañas con indicador y teclado. |
| Agenda | Resumen abierto y confirmados semánticos; conserva grilla semanal, inspector y diseño móvil por día. |
| Perfil público | Servicios sin cajas por dato; mayor presencia de fotos con composición editorial; reputación y disponibilidad reales. |
| Perfil privado | Secciones editables más abiertas; controles y superficies consistentes. |
| Tu mes | Resumen narrativo con solicitudes/presupuestos aceptados/trabajos; exposición, gráfico y opiniones reales, menos paneles enmarcados. |
| Free/PRO | Beneficios por situaciones de trabajo, Free abierto y PRO con superficie/rail; conserva precios y condiciones vigentes del backend. |
| Servicios, urgencias, pedidos y presupuestos | Propagación de tokens/controles y estados semánticos manteniendo los flujos actuales. |

### 5. UX y accesibilidad

Comparar es una selección con círculo, check y `aria-pressed`, no otro CTA del
mismo peso. El filtro conserva resultados durante la recarga y los vuelve inertes
para evitar acciones sobre información desactualizada. Se mantienen skeleton,
retry y vacío. Los estados se comunican con texto/iconos además del color.
Focus-visible global, navegación de pestañas por teclado y áreas de 44 px en
controles principales. Diálogos conservan Escape, foco contenido y devolución
de foco; portfolio conserva flechas y visor nativo.

### 6. Movimiento

Curva cubic-bezier(.2,.8,.2,1); botones 160 ms, menús/selección 200 ms y vistas
260 ms. Flecha de presupuesto avanza 2 px; presión sutil; entrada/salida de
comparación con fade/desplazamiento de 8 px; tabs con indicador; modales con
fade/escala 0,98; theme switch con transición temporal. Acordeones interpolan
altura cuando el navegador lo admite y siguen funcionando sin esa capacidad.
Reduced motion elimina desplazamientos/escalas nuevos y shimmer, conservando
feedback de color/opacidad. No se agregan loops decorativos ni dependencias.

### 7. Dark mode

Canvas, superficie y elevada tienen tres niveles reales. Menús, campos, modales
y barra contextual se elevan sobre el contenido. Petrol de texto separado del
relleno de acción; clay y texto cálido conservan carácter. Se actualizan script
anti-flash, ThemeStore, meta theme-color y manifest de forma coherente.

### 8. Tratamiento PRO

Destacado usa Brand 100/brand-soft, rail petrol, avatar mayor y kicker
«RESUELVE PRO · PROFESIONAL DESTACADO». Explicación visible:
«Perfil destacado por Resuelve PRO · Espacio promocionado (pago)».
Solo aparece cuando el dato real `isFeaturedPlacement` lo indica. `pro`,
verificación, valoración y destacado siguen siendo conceptos separados.
No cambia ranking ni se promete mayor calidad por pagar.

### 9. Decisiones conservadas

- Home abierta y editorial: ya era la mejor referencia de identidad.
- Grilla de agenda y layout móvil específico: responden a tareas diferentes.
- Gráficos existentes y tablas accesibles: ya presentan datos reales sin adornos.
- Comparación de hasta seis y solicitud múltiple: son capacidades reales útiles,
  aunque convivan como acción secundaria en la barra.
- Billing, precios, entitlements, cálculos, contratos, modelos, guards,
  persistencia y privacidad: sin cambios de negocio ni backend.
- Diálogos, iconos y tipografías existentes; sin biblioteca de motion adicional.

### 10. Validación y límites

- `npm test -- --watch=false`: **502 tests, 34 archivos, todos correctos**.
  Se conservan los 500 existentes y se añaden dos tests de teclado de pestañas.
  Persisten mensajes previos de jsdom sobre `Window.scrollTo`.
- `npm run build`: **production correcto**, browser/SSR y 23 rutas prerenderizadas.
  Bundle inicial 539,09 kB; warning de budget de 520 kB ya existente
  (base 536,35 kB). Incremento 2,74 kB; no se alteró el budget.
- `tsc -p tsconfig.app.json --noEmit`: **correcto**.
- `git diff --check`: **correcto**. Sin script de lint frontend disponible.
- Chromium: 14 pantallas × claro/oscuro × 390/768/1024/1440/1720 px,
  más comparación en ambos temas: **142 revisiones sin overflow horizontal
  ni errores JavaScript/console no controlados**.
- Pruebas de interacción: selección, limpiar comparación, foco/Escape, tema y
  persistencia, tabs con flechas/End, portfolio, filtro con carga diferida,
  vacío, error/reintento y preferencia reduced motion.
- Comprobación de contraste del texto renderizado sobre fondos compuestos en
  nueve pantallas principales y ambos temas: sin pares inferiores a AA después
  de los ajustes (4,5:1 texto normal; 3:1 texto grande). No constituye una
  certificación integral de accesibilidad ni una auditoría de todos los estados.
- QA visual usa respuestas API interceptadas y fotos sintéticas rotuladas
  **solo en herramientas locales de prueba**. No se agregan datos ficticios al
  producto. Esta validación no equivale a operar cuentas y pagos contra el backend
  real; se conservan las pruebas existentes para esas reglas y contratos.
- Fotogramas, capturas y scripts auxiliares están en `.visual-audit/`, ignorada
  por Git. El informe y los cambios de producto sí quedan en el repositorio.
