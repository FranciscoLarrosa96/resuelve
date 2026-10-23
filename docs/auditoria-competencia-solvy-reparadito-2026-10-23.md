# Auditoría de competencia: Solvy y ReparaDito · 23 de octubre de 2026

## Alcance

Se revisaron las páginas públicas de [solvy.com.ar](https://www.solvy.com.ar/) y [reparadito.com.ar](https://reparadito.com.ar/), sin crear cuentas: inicio, páginas para profesionales y anunciantes, ayuda, una página de servicio nacional, una por localidad (Tandil), búsqueda, un perfil, `robots.txt` y `sitemap.xml`. No se probaron sus apps móviles ni sus flujos con sesión. La comparación con Resuelve usa producción (`resuelve.com.ar`, como navegador y como Googlebot/WhatsApp) y el código de `main`.

Todo lo que sigue sobre la competencia es lo que **sus páginas dicen**, no algo verificado por nosotros (por ejemplo, Solvy dice ser "la plataforma más grande de Argentina", pero no publica métricas).

## Resumen

- **Solvy** es un directorio nacional grande. Es gratis para el profesional y cobra por posición (Destacado a $25.000 cada 30 días) y por publicidad de comercios ($50.000 y $100.000). Su fuerza es el SEO: 2.192 URLs en el sitemap. Sus debilidades son la confianza (no verifica matrículas, casi todos los perfiles dicen "Sin reviews aún", incluidos los Destacados) y casi no tiene oferta en Tandil.
- **ReparaDito** es una app Android con aprobación manual de cada profesional. Ordena por cercanía y después por calificación, y "no vende posiciones". Da 60 días gratis y después cobra una membresía prevista de $3.999 cada 30 días. Su fuerza es la historia humana (fundadores con nombre y apellido) y una regla clara de reseñas. Sus debilidades: solo tiene Android, pide CUIT y condición de IVA para registrarse, su web casi no se indexa (5 URLs) y no tiene pedido de presupuestos.
- **Resuelve** es el único de los tres con pedido de presupuestos, comparación, agenda, cierre del trabajo y matrícula verificada por número. Ninguno de los dos competidores tiene esas funciones. El riesgo es que se explica peor: los otros dos venden "gratis, sin comisión, te escriben por WhatsApp" en una línea, y nuestro mensaje para profesionales es más largo y más técnico.

## Comparación

| Tema | Solvy | ReparaDito | Resuelve |
|---|---|---|---|
| Modelo para el cliente | Directorio: buscar y escribir por WhatsApp o chat | Directorio en app: buscar por cercanía y escribir por WhatsApp o llamar | Directorio **más** pedido de presupuestos, comparación, agenda y cierre |
| Cuenta del cliente | Para buscar no; para contactar sí ("el login se pide al contactar") | No para contactar; sí para calificar y guardar favoritos | No para contactar por WhatsApp o llamada; sí para pedir presupuestos |
| Costo para el profesional | Gratis; Destacado $25.000 cada 30 días (pago único, sin renovación automática) | 60 días gratis y después membresía prevista de $3.999 cada 30 días por Mercado Pago | Gratis para siempre (con cupo de respuestas de búsqueda); PRO mensual opcional (precio de `/plans`, default del código $15.000) |
| Qué vende el pago | Solo posición: "salís primero", estrella dorada, portada | Estar publicado | Visibilidad rotulada, 30 trabajos con fotos, estadísticas, respuestas sin cupo, PDF y CSV |
| Comisión | No | No | No |
| Alta del profesional | Mail o Google + WhatsApp verificado por código; foto, rubro y zona | Formulario largo: foto, **CUIT/CUIL**, **condición de IVA**, dirección, 1 o 2 rubros, redes obligatorias; revisión manual | 4 pasos: servicios, dónde, perfil y revisión; sin CUIT, sin revisión manual |
| Matrícula | Declarada, **no verificada** (lo aclaran en sus Términos) | La piden antes de aprobar en los rubros que la exigen; no dicen cómo la verifican | Verificada por número en el registro oficial; no restringe la publicación |
| Identidad | Opcional con DNI y selfie: sello "Identidad verificada" o "ID OK" | Revisión manual del perfil | No hay verificación de identidad (la foto no es identidad) |
| Reseñas | "Los clientes que te contactaron por Solvy" | Solo quien contactó desde la app y confirmó el servicio, con confirmación del profesional y moderación previa | Solo trabajos `COMPLETED` por Resuelve; las de clientes invitados van aparte y no suman al puntaje |
| Orden de resultados | Destacados pagos primero | Cercanía y después calificación, sin posiciones pagas | Recomendados, con Destacados rotulados y rotando, sin enterrar a Free; "Ordenar por" a elección del cliente |
| Datos extra en la tarjeta | Garantía de N días, factura A/C, rango "Desde $X – $Y", años por rubro | Fotos de trabajos, descripción y redes | Rating, reseñas, "Suele responder en…", matrícula, portadas de trabajos (PRO) |
| Cobertura | Nacional, fuerte en AMBA, Córdoba, Rosario y Mar del Plata; en Tandil, **1 plomero** | Nacional (dice); sin datos visibles en la web | Multiciudad, con oferta real en Tandil, Mar del Plata y Necochea |
| SEO | 2.192 URLs: 847 perfiles y 1.335 combinaciones servicio/ciudad/barrio; JSON-LD `FAQPage`, `ItemList`, `Service` y `ProfessionalService`; `noindex` donde hay poca oferta; guía por oficio con precios de referencia | 5 URLs; la búsqueda real está en la app | 63 URLs: 36 de servicios, 12 de ciudades y 9 perfiles; JSON-LD equivalente para bots; `noindex` sin oferta |
| App | Android e iPhone (dice) | Android; iPhone "próximamente" | PWA instalable, sin tiendas |
| Otros ingresos | Comercios $50.000 y $100.000 cada 30 días; Google AdSense | No | No |
| Quiénes son | Sin personas visibles | Página de fundadores, historia desde 2017, origen en Arias (Córdoba) | Responsable con nombre solo en Términos y Privacidad |

## Lo que Resuelve ya hace mejor (hay que contarlo)

1. **Matrícula verificada por número.** Solvy dice por escrito que no verifica matrículas. Es nuestra diferencia más fuerte en gas y electricidad, y en `/trabaja-con-resuelve` aparece recién en la FAQ.
2. **Pedir presupuestos y comparar.** Ninguno de los dos lo tiene. El cliente que no sabe a quién llamar escribe a varios por WhatsApp y repite la historia. Resuelve se la cuenta una vez a varios.
3. **Agenda y cierre del trabajo.** Ellos terminan en "te escriben por WhatsApp". Nosotros seguimos hasta el trabajo realizado y la reseña ligada a ese trabajo.
4. **Gratis de verdad para siempre.** ReparaDito es gratis por 60 días y después se paga. Nuestro Free no vence.
5. **Privacidad del cliente.** La dirección y el teléfono solo los ve el profesional elegido.
6. **Presencia en Tandil.** La página "Plomería en Tandil" de Solvy tiene 1 profesional y está en `noindex`. La nuestra está indexada y con oferta real. Ahí está la ventaja de arrancar local.

## Qué podemos usar a nuestro favor

Ordenado por impacto y esfuerzo. Nada de esto cambia precios, cupos ni reglas de cobro.

### Alta prioridad (texto y presentación, sin migraciones)

1. **Una línea de garantías para el profesional, arriba de todo en `/trabaja-con-resuelve`.** Solvy lo resume en "Sin comisión. Sin exclusividad. Sin permanencia." Las tres cosas son ciertas en Resuelve (no cobramos el trabajo, nada impide estar en otras plataformas y PRO se cancela cuando quiera). Hoy lo decimos disperso en la FAQ. Sumar además "Gratis para siempre, no es una prueba" como contraste con ReparaDito, sin nombrarlo.
2. **Bloque "Lo que te pedimos / Lo que no te pedimos".** Es el formato más claro de Solvy. En Resuelve el "no te pedimos" es más fuerte: ni CUIT, ni condición de IVA, ni tarjeta, ni matrícula para aparecer, ni comisión. Baja la fricción del alta frente a ReparaDito, que pide CUIT e IVA.
3. **Subir la matrícula verificada al argumento principal.** En la página para profesionales y en la página de servicio por localidad: "En gas y electricidad chequeamos el número en el registro oficial". Hoy está en el inicio del cliente, pero no en el mensaje al profesional matriculado, que es justamente el que más valora la diferencia.
4. **Página "Quiénes somos".** ReparaDito tiene una página entera de fundadores, con historia, ciudad de origen y personas reales. Para un marketplace local que pide confianza (y para el SEO de entidad), una página corta con quién hace Resuelve, desde Tandil y por qué, con datos que ya son públicos en los Términos, suma más que cualquier sello. Enlazarla en el pie y en `Organization` del JSON-LD.

### Prioridad media (pequeñas funciones, con datos reales)

5. **Precios de referencia por oficio y localidad.** Solvy publica "los plomeros de Tandil publican precios entre $30.000 y $80.000 (19 profesionales con precio cargado)". Es un dato muy buscado ("cuánto cobra un plomero") y bueno para SEO. Resuelve podría mostrarlo con **presupuestos reales** de esa localidad y servicio, con una muestra mínima (como `local-demand.ts`, mínimo 3) y sin mostrarlo si no la alcanza. Necesita una decisión de privacidad y de copy; no se inventa con perfiles declarados.
6. **Garantía, factura y "precio desde" en el perfil.** Solvy muestra "Garantía 90 días", "Factura C" y "Desde $35.000" en la tarjeta. Son tres campos opcionales que el profesional declara y que ayudan a elegir. Si se suman: declarados (rotulados como tales), opcionales, Free y PRO por igual y sin vender como PRO. Requiere una migración nueva.
7. **"Recién llegados".** Solvy tiene una sección para profesionales nuevos "buscando sus primeros trabajos". Encaja con la regla de no enterrar a Free y le da al nuevo un motivo para completar el perfil. Mostrarla solo con perfiles publicados reales y con un mínimo, nunca con relleno.
8. **"Prefiere que lo contactes por WhatsApp".** Solvy deja que el profesional marque su canal preferido. Es un cambio chico sobre `ContactActions`/`DirectContact`: el canal preferido va primero.

### Para decidir (cambios de producto o de negocio)

9. **Verificación de identidad opcional.** Es el sello de confianza que más muestra Solvy ("ID OK"). Implica guardar fotos de DNI y una selfie (datos sensibles, Política de Privacidad y revisión humana o un proveedor). Recomendación: no ahora. La matrícula verificada ya cubre el caso más sensible (gas y electricidad).
10. **Publicidad de comercios locales** (ferreterías, corralones, pinturerías). Es una fuente de ingresos que Solvy cobra entre $50.000 y $100.000. En Tandil podría tener sentido más adelante, pero compite con "pocas cards" y con la claridad de los resultados. Recomendación: no antes de tener tráfico medido que mostrarles. Solvy mismo admite que no publica métricas de audiencia.
11. **Prueba más larga frente a los 60 días de ReparaDito.** No cambiaría la prueba PRO de 7 días: ReparaDito regala 60 días de *estar publicado*, cosa que en Resuelve ya es gratis para siempre. El argumento correcto es el punto 1, no alargar la prueba.

## Lo que no conviene copiar

- **Afirmaciones sin datos** ("la plataforma más grande de Argentina", "en tu zona hay gente buscando lo que vos hacés"). Van contra la regla de no inventar. La segunda la podemos decir **solo** con la demanda real de esa localidad.
- **Destacados sin reseñas en la portada.** Solvy llena "Profesionales destacados" con perfiles "Sin reviews aún": la portada parece vacía y deja ver que el lugar se pagó.
- **Perfiles con 28 oficios** (en Solvy, uno incluye albañilería, masajes y dirección de obra). Diluye la búsqueda y la confianza. Mantener el foco por oficio.
- **Contadores inconsistentes.** En la página de Tandil, Solvy dice "1 profesional en Tandil" pero "19 profesionales con precio cargado" y "Electricidad · 278", que parecen cifras nacionales. Si sumamos los puntos 5 o 7, que cada número salga de la misma consulta que la lista.
- **Aprobación manual de cada alta y CUIT obligatorio** (ReparaDito). Frenan el alta. Nuestro "publicás en 4 pasos" es mejor.
- **Pedir cuenta para contactar** (Solvy). Resuelve ya deja contactar sin cuenta; hay que conservarlo.

## Hallazgos laterales en Resuelve

- **Rutas inexistentes responden 200.** `https://resuelve.com.ar/no-existe-xyz` devuelve HTTP 200 con el título del inicio y sin `noindex`, tanto para el navegador como para Googlebot. La página "Esta página no existe" aparece al hidratar, pero para un buscador es un "soft 404". La Fase 8 pide "404 real". Conviene revisarlo en un cambio aparte; tocaría la configuración de Vercel, que este documento no modifica.
- **Nombres de servicio con formato distinto** en la lista "Otros servicios" de una página de ciudad: "SERVICE DE MÁQUINAS" en mayúsculas y "Drywall, durlock, construcción en seco." con punto final. Parece que se cargaron a mano en el catálogo; conviene normalizarlos.
- Las páginas de servicio, ciudad y perfil sirven título y JSON-LD correctos a bots (`api/service-page.ts`, `api/public-profile.ts`), al mismo nivel que Solvy. La diferencia de SEO es de **volumen** (63 URLs contra 2.192), no técnica: crece con perfiles y oferta reales por localidad, no con páginas vacías.

## Fuentes

Páginas consultadas el 23/10/2026:

- Solvy: `/`, `/soy-profesional`, `/anunciar`, `/ayuda`, `/servicios/plomeria`, `/servicios/plomeria/tandil`, `/search?q=plomero`, un perfil `/professional/…`, `/robots.txt`, `/sitemap.xml`.
- ReparaDito: `/` (con FAQ y Términos), `/buscar/`, `/fundadores/`, `/sumate/`, `/robots.txt`, `/sitemap.xml`.
- Resuelve: `/`, `/trabaja-con-resuelve`, `/servicios/plomeria`, `/ciudades/buenos-aires/tandil/servicios/plomeria`, `/ciudades/buenos-aires/mar-del-plata/servicios/electricidad`, un perfil `/p/…`, una ruta inexistente y `/sitemap.xml`.
