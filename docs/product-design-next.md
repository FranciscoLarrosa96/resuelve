# RESUELVE · revisión de producto

## Auditoría previa
Se recorrieron las rutas, shells, templates y componentes compartidos. Se conservan guards, contratos, stores, estados y acciones existentes. La deuda dominante es la repetición de superficies con borde, serif en herramientas operativas y templates públicos duplicados por dispositivo. El listado no entrega portfolio; únicamente el detalle entrega workPhotos. No corresponde inventar fotos ni realizar una consulta adicional por cada resultado.

## Dirección
Marketplace: búsqueda como punto de partida, categorías como atajos, confianza contextual y perfiles con jerarquía vertical. Workspace: sans, inbox conectado al detalle, agenda temporal y analytics con conclusión principal. Petrol identifica interacción; arcilla llama a actuar; verde comunica estados positivos. PRO es presencia de una cuenta paga, nunca recomendación.

## Composiciones
Home unificada y responsive. Resultados sin sidebar de formulario; filtros rápidos y diálogo nativo como sheet mobile. Free compacto, PRO con identidad mayor y evidencia comercial real, patrocinado con spotlight y un único rótulo pago. Perfil con portfolio temprano y acción sticky. Urgencias sin columna explicativa permanente. Solicitudes con pane conectado; agenda con prioridad de coordinación y fechas; analytics con insight y recorrido de conteos (no cohortes).

## Verificación
`npm test -- --watch=false`: 527 pruebas en 38 archivos, todas pasan. Incluye sugerencias reales del catálogo, descarte con Escape y navegación sin crear pedido; agenda conserva trabajos vencidos/sin fecha y agrupa próximos por fecha y hora. La suite existente mantiene cobertura de comparación, permisos Free/PRO, privacidad, solicitudes, pagos, perfil y analytics.

`npm run test:metadata`: 6 pruebas pasan. `npm run build`: correcto, prerender de 24 rutas. Advertencias: bundle inicial 545,62 kB frente a 520 kB; CSS de Home 6,27 kB frente a 4 kB. No se ampliaron presupuestos para ocultarlas. `git diff --check`: correcto.

En navegador se verificaron Home, resultados, Urgencias y directorio a 390, 768, 1024, 1280, 1440 y 1920: sin desbordamiento horizontal en los estados disponibles. Se inspeccionó Home en claro y oscuro, resultados con sheet oscuro en mobile/tablet, Urgencias oscuro mobile, validación de búsqueda vacía y retorno de foco al cerrar filtros con Escape.

Limitación: API remota y local no disponibles en la sesión. No se verificó visualmente el contenido con datos reales ni el workspace autenticado; las pruebas HTTP usan fixtures exclusivamente en tests. La matriz visual completa de pantallas/temas con una sesión real queda pendiente. No se usan cuentas, métricas o testimonios ficticios en el producto.

## Decisiones y deuda explícita
- Portfolio en resultados: requiere ampliar el summary de la API; por ahora se priorizan servicios, bio y evidencia existentes, sin consultas N+1.
- PRO, matrícula e identidad siguen siendo señales independientes; pagar no implica verificación ni recomendación.
- No se cambian contratos, guards, permisos, reglas de negocio ni flujos de pago.
- Se eliminó del Plan PRO el ejemplo con métricas ficticias y se dirige a estadísticas propias.
- Los controles de cuenta y pantallas secundarias conservan su lógica; comparten foundations y tipografía operativa, pero no recibieron un rediseño completo.
- Queda optimización de los dos presupuestos de tamaño y QA visual autenticado en ambos temas. La configuración de desarrollo presente en el workspace se conserva.
