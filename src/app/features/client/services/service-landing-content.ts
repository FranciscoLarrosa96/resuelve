/**
 * Contenido de la página pública de un servicio: nacional (`/servicios/:slug`) o en una localidad
 * (`/ciudades/:provincia/:localidad/servicios/:slug`). Única fuente: la comparte la página de Angular y
 * `api/service-page.ts` (HTML para buscadores). Solo dice lo que el producto hace: nada de precios, cantidades ni
 * profesionales inventados. Una localidad sin profesionales del servicio NO se indexa (`landingIndexable`).
 */

/** Localidad de la página (del catálogo; nunca solo por nombre). */
export interface LandingPlace {
  name: string;
  slug: string;
  province: { name: string; slug: string };
}

/** Ruta de la página: nacional o de la localidad. */
export function landingPath(service: { slug: string }, place?: LandingPlace | null): string {
  return place
    ? `/ciudades/${place.province.slug}/${place.slug}/servicios/${service.slug}`
    : `/servicios/${service.slug}`;
}

/**
 * Solo se indexa lo que tiene valor real: la página nacional del servicio siempre (guía, preguntas y ciudades con
 * oferta); la de una localidad, solo si hay al menos un profesional que ofrece el servicio ahí. Así no se generan
 * miles de páginas vacías cambiando solo el nombre de la ciudad.
 */
export function landingIndexable(place: LandingPlace | null | undefined, professionalsCount: number): boolean {
  return !place || professionalsCount > 0;
}

/** Texto común con `{city}`: la localidad, o una frase general en la página nacional. */
export function placeText(text: string, place?: LandingPlace | null): string {
  if (place) return text.replace(/\{city\}/g, place.name);
  return text
    .replace(/dentro de \{city\}/g, 'dentro de tu ciudad')
    .replace(/,? en \{city\}/g, '')
    .replace(/de \{city\}/g, 'de tu ciudad')
    .replace(/\{city\}/g, 'tu ciudad');
}
export interface LandingService {
  name: string;
  slug: string;
  requiresLicense: boolean;
  category: { name: string; slug: string };
}

export interface LandingCopy {
  title: string;
  description: string;
  heading: string;
  /** Nombre del servicio sobre el H1 cuando el H1 es el oficio ("Plomería" → "Plomeros en Tandil"). */
  kicker: string | null;
  professionalsHeading: string;
  /** Preguntas frecuentes: solo lo que el producto hace. */
  faq: { question: string; answer: string }[];
  intro: string;
  steps: { title: string; text: string }[];
  licenseNote: string | null;
  /** Texto propio del servicio (SERVICE_GUIDES); null si todavía no tiene. */
  guide: ServiceGuide | null;
}

/**
 * Texto propio de cada servicio del catálogo (`backend/src/database/catalog/catalog.data.ts`). Solo orientación
 * general: sin precios, plazos ni promesas. Un servicio nuevo sin entrada usa solo el texto común.
 */
export interface ServiceGuide {
  /** Cómo se busca al profesional ("plomero en Tandil"): va en el título, el H1 y las preguntas. */
  trade?: { one: string; many: string; feminine?: boolean };
  about: string;
  jobs: string[];
  tips: string[];
}

export const SERVICE_GUIDES: Record<string, ServiceGuide> = {
  electricidad: {
    trade: { one: 'electricista', many: 'electricistas' },
    about:
      'Desde un tomacorriente que no anda hasta un tablero nuevo: contá qué pasa y los electricistas de {city} te responden con su presupuesto.',
    jobs: ['Tableros y térmicas', 'Cortocircuitos y cortes de luz en la casa', 'Tomas e interruptores', 'Iluminación y ventiladores', 'Instalaciones nuevas'],
    tips: ['Contá qué pasó y desde cuándo (por ejemplo, si salta la térmica al usar un aparato).', 'Si podés, sumá fotos del tablero o de la zona afectada.', 'Mientras tanto, no manipules instalaciones que saltan o chispean.'],
  },
  gas: {
    trade: { one: 'gasista', many: 'gasistas' },
    about:
      'Instalaciones, artefactos y revisiones de gas con gasistas de {city}. Describí el trabajo y compará los presupuestos que recibas.',
    jobs: ['Instalaciones de gas', 'Calefactores y estufas', 'Calefones y termotanques', 'Pruebas de hermeticidad', 'Detección de fugas'],
    tips: ['Indicá qué artefacto es y, si lo sabés, la marca y el modelo.', 'Si sentís olor a gas, ventilá, no uses fuego ni interruptores y llamá a la empresa de gas.', 'Para trabajos de gas pedí siempre un profesional matriculado.'],
  },
  plomeria: {
    trade: { one: 'plomero', many: 'plomeros' },
    about:
      'Pérdidas, canillas, destapaciones y más: contanos qué pasa en tu casa y los plomeros de {city} te mandan su presupuesto.',
    jobs: ['Pérdidas y filtraciones', 'Griferías y canillas', 'Termotanques', 'Destapaciones', 'Sanitarios', 'Cañerías'],
    tips: ['Contá dónde está el problema y desde cuándo.', 'Una foto o un video corto de la pérdida ayuda a entender el trabajo.', 'Si el agua no para, cerrá la llave de paso mientras esperás.'],
  },
  cerrajeria: {
    trade: { one: 'cerrajero', many: 'cerrajeros' },
    about:
      'Cerraduras, aperturas y copias de llaves en {city}. Si es una urgencia, marcalo en tu pedido para recibir respuestas de quienes pueden hoy.',
    jobs: ['Aperturas de puertas', 'Cambio de cerraduras', 'Copias de llaves', 'Cerraduras de seguridad', 'Arreglo de puertas que no cierran'],
    tips: ['Indicá el tipo de puerta (madera, metal, blindada) y de cerradura si lo sabés.', 'Decí si es una urgencia y desde dónde estás.', 'Elegí a quien tenga buenas opiniones de clientes reales.'],
  },
  'aire-acondicionado': {
    trade: { one: 'técnico de aire acondicionado', many: 'técnicos de aire acondicionado' },
    about:
      'Instalación, limpieza y reparación de aires acondicionados con profesionales de {city}. Contanos qué equipo tenés y qué necesitás.',
    jobs: ['Instalación de equipos', 'Carga de gas', 'Limpieza y mantenimiento', 'Reparaciones'],
    tips: ['Contá marca, modelo y tipo de equipo (split, ventana, inverter).', 'Si falla, describí qué hace o qué no hace.', 'Para una instalación, indicá dónde iría la unidad interior y la exterior.'],
  },
  pintura: {
    trade: { one: 'pintor', many: 'pintores' },
    about:
      'Pintura de interiores y exteriores en {city}: describí los ambientes y recibí presupuestos de pintores de la ciudad.',
    jobs: ['Pintura de interiores', 'Pintura de exteriores', 'Impermeabilización', 'Enduido y reparaciones de paredes'],
    tips: ['Contá cuántos ambientes o metros son y el estado de las paredes.', 'Sumá fotos, sobre todo si hay humedad o descascarados.', 'Aclará si querés que el profesional ponga los materiales.'],
  },
  albanileria: {
    trade: { one: 'albañil', many: 'albañiles' },
    about:
      'Arreglos y obras chicas de albañilería en {city}. Contá qué querés resolver y compará presupuestos de albañiles de la ciudad.',
    jobs: ['Humedad', 'Revoques', 'Contrapisos', 'Pequeñas reformas', 'Arreglos de paredes y pisos'],
    tips: ['Describí el trabajo con medidas aproximadas si las tenés.', 'Subí fotos del lugar para que el presupuesto sea más preciso.', 'Aclará si necesitás que se encargue también de los materiales.'],
  },
  carpinteria: {
    trade: { one: 'carpintero', many: 'carpinteros' },
    about:
      'Muebles a medida, arreglos y trabajos en madera con carpinteros de {city}. Describí lo que necesitás y recibí presupuestos.',
    jobs: ['Muebles a medida', 'Arreglo de puertas y ventanas de madera', 'Placares y bajo mesadas', 'Reparación de muebles', 'Estantes y trabajos en madera'],
    tips: ['Indicá medidas aproximadas y dónde va el mueble.', 'Una foto o un dibujo simple de lo que imaginás ayuda mucho.', 'Aclará el material y el acabado que preferís.'],
  },
  herreria: {
    trade: { one: 'herrero', many: 'herreros' },
    about:
      'Rejas, portones, escaleras y otros trabajos en metal con herreros de {city}. Contanos qué necesitás.',
    jobs: ['Rejas y protecciones', 'Portones y puertas', 'Escaleras y barandas', 'Estructuras y soldaduras', 'Reparaciones en metal'],
    tips: ['Indicá medidas aproximadas y si es para interior o exterior.', 'Sumá fotos del lugar donde va el trabajo.', 'Aclará si lo querés pintado o con otro terminado.'],
  },
  'reparacion-de-electrodomesticos': {
    trade: { one: 'técnico de electrodomésticos', many: 'técnicos de electrodomésticos' },
    about:
      'Si un electrodoméstico dejó de funcionar, contá qué pasa y los técnicos de {city} te responden con su presupuesto.',
    jobs: ['Lavarropas', 'Heladeras', 'Cocinas y hornos', 'Microondas y otros electrodomésticos chicos'],
    tips: ['Indicá marca, modelo y qué falla (o qué ruido hace).', 'Decí cuánto hace que tiene el problema.', 'Una foto de la etiqueta con el modelo ayuda al técnico.'],
  },
  'corte-de-pasto': {
    about:
      'Corte de pasto para jardines y terrenos de {city}. Contá el tamaño del lugar y cada cuánto lo necesitás.',
    jobs: ['Corte de pasto en casas', 'Corte en terrenos', 'Bordeado y prolijado', 'Servicio periódico'],
    tips: ['Indicá los metros aproximados del jardín o terreno.', 'Aclará si es una vez o un servicio periódico.', 'Contá si hay que retirar el pasto cortado.'],
  },
  jardineria: {
    trade: { one: 'jardinero', many: 'jardineros' },
    about:
      'Mantenimiento y armado de jardines en {city}. Contanos qué querés lograr y recibí presupuestos de jardineros de la ciudad.',
    jobs: ['Mantenimiento de jardines', 'Plantación y armado de canteros', 'Cuidado de plantas', 'Riego', 'Arreglo de espacios verdes'],
    tips: ['Describí el espacio y qué querés cambiar o mantener.', 'Sumá fotos del jardín actual.', 'Aclará si querés un servicio único o periódico.'],
  },
  poda: {
    about:
      'Poda de árboles, arbustos y setos en {city}. Contá qué hay que podar y recibí presupuestos.',
    jobs: ['Poda de árboles', 'Poda de arbustos y setos', 'Retiro de ramas', 'Extracción de ramas peligrosas'],
    tips: ['Indicá la altura aproximada y la cantidad de árboles.', 'Subí fotos desde distintos ángulos.', 'Aclará si hay cables o construcciones cerca.'],
  },
  'limpieza-de-terrenos': {
    about:
      'Limpieza y desmalezado de terrenos en {city}. Describí el lugar y recibí presupuestos de profesionales de la ciudad.',
    jobs: ['Desmalezado', 'Limpieza de terrenos baldíos', 'Retiro de escombros y residuos', 'Preparación del terreno'],
    tips: ['Indicá los metros aproximados del terreno.', 'Contá qué hay que sacar (yuyos, escombros, restos de obra).', 'Una foto del estado actual ayuda a cotizar.'],
  },
  fletes: {
    about:
      'Fletes para llevar muebles, electrodomésticos u otras cargas dentro de {city}. Contá qué se transporta y recibí presupuestos.',
    jobs: ['Traslado de muebles y electrodomésticos', 'Entregas de compras grandes', 'Cargas dentro de la ciudad'],
    tips: ['Listá lo que hay que llevar y, si podés, tamaños aproximados.', 'Indicá el origen, el destino y si hay escaleras o ascensor.', 'Aclará si necesitás ayuda para cargar y descargar.'],
  },
  mudanzas: {
    about:
      'Mudanzas en {city}: contá desde dónde y hacia dónde te mudás y recibí presupuestos de profesionales de la ciudad.',
    jobs: ['Mudanzas de casas y departamentos', 'Traslado de muebles', 'Embalaje y carga', 'Mudanzas chicas'],
    tips: ['Indicá el tamaño de la vivienda y qué se lleva.', 'Contá si hay escaleras o ascensor en origen y destino.', 'Aclará la fecha deseada para coordinar con tiempo.'],
  },
  'retiro-de-muebles': {
    about:
      'Retiro de muebles y objetos que ya no querés, en {city}. Contá qué hay que sacar y recibí presupuestos.',
    jobs: ['Retiro de muebles usados', 'Retiro de electrodomésticos', 'Vaciado de ambientes', 'Retiro de objetos voluminosos'],
    tips: ['Listá lo que se retira y sumá fotos.', 'Indicá el piso y si hay escaleras o ascensor.', 'Aclará si hay que desarmar algo antes de sacarlo.'],
  },
  'camaras-y-alarmas': {
    about:
      'Instalación y revisión de cámaras y alarmas en casas y comercios de {city}. Contanos qué querés cubrir.',
    jobs: ['Instalación de cámaras', 'Alarmas', 'Revisión de sistemas existentes', 'Ampliaciones'],
    tips: ['Indicá cuántas zonas querés vigilar y si son interiores o exteriores.', 'Contá si ya tenés equipos instalados.', 'Aclará si querés poder ver las cámaras desde el celular.'],
  },
  redes: {
    about:
      'Redes de internet y WiFi para casas y comercios de {city}: cobertura, cableado y configuración. Contá qué problema querés resolver.',
    jobs: ['Instalación de WiFi', 'Mejora de cobertura', 'Cableado de red', 'Configuración de equipos'],
    tips: ['Contá el tamaño del lugar y dónde está el módem.', 'Describí qué falla (zonas sin señal, cortes, lentitud).', 'Indicá si ya tenés equipos o hay que comprarlos.'],
  },
  'reparacion-de-pc': {
    trade: { one: 'técnico de PC', many: 'técnicos de PC' },
    about:
      'Reparación y mantenimiento de computadoras en {city}. Contá qué le pasa a tu equipo y recibí presupuestos.',
    jobs: ['Diagnóstico de fallas', 'Limpieza y mantenimiento', 'Reinstalación de sistema', 'Cambio de componentes'],
    tips: ['Indicá si es notebook o PC de escritorio, marca y modelo.', 'Describí qué falla o qué mensajes muestra.', 'Si tenés información importante, avisá para que se resguarde.'],
  },
  'limpieza-de-interior': {
    about:
      'Limpieza de casas, departamentos y oficinas en {city}. Contá qué hay que limpiar y cada cuánto, y recibí presupuestos de profesionales de la ciudad.',
    jobs: ['Limpieza general de casas y departamentos', 'Limpieza después de una mudanza u obra', 'Limpieza de oficinas y locales', 'Servicio periódico'],
    tips: ['Indicá cuántos ambientes son y si hay algo que necesite atención especial.', 'Aclará si es una sola vez o un servicio periódico.', 'Contá si los productos de limpieza los ponés vos.'],
  },
  ninera: {
    trade: { one: 'niñera', many: 'niñeras', feminine: true },
    about:
      'Niñeras para cuidar a tus hijos en {city}. Contá edades, días y horarios, y recibí propuestas de personas de la ciudad.',
    jobs: ['Cuidado por horas', 'Cuidado de día o de noche', 'Acompañamiento a la escuela o actividades', 'Cuidado periódico'],
    tips: ['Indicá cuántos chicos son y sus edades.', 'Contá los días y horarios que necesitás.', 'Antes de decidir, conocé a la persona y mirá las opiniones de otros clientes.'],
  },
  contador: {
    trade: { one: 'contador', many: 'contadores' },
    about:
      'Contadores de {city} para monotributo, impuestos y trámites contables. Contá tu situación y recibí presupuestos.',
    jobs: ['Alta y recategorización de monotributo', 'Declaraciones juradas e impuestos', 'Liquidación de sueldos', 'Asesoramiento contable para emprendimientos'],
    tips: ['Contá si sos monotributista, responsable inscripto o empleador.', 'Indicá qué necesitás resolver y si hay fechas de vencimiento cerca.', 'Tené a mano tu CUIT y la documentación que tengas.'],
  },
  abogado: {
    trade: { one: 'abogado', many: 'abogados' },
    about:
      'Abogados de {city} para consultas y trámites legales. Contá tu caso en pocas palabras y recibí propuestas.',
    jobs: ['Consultas legales', 'Contratos y alquileres', 'Sucesiones', 'Temas laborales', 'Familia'],
    tips: ['Contá el tema en general, sin datos sensibles en el primer mensaje.', 'Indicá si hay plazos o fechas que correr.', 'Tené a mano la documentación relacionada para la primera consulta.'],
  },
  martillero: {
    trade: { one: 'martillero', many: 'martilleros' },
    about:
      'Martilleros de {city} para tasaciones, ventas y alquileres. Contá qué necesitás y recibí propuestas.',
    jobs: ['Tasaciones', 'Venta de inmuebles', 'Alquileres', 'Remates'],
    tips: ['Indicá el tipo de inmueble o bien y el barrio.', 'Contá si querés tasar, vender o alquilar.', 'Sumá fotos o datos generales del inmueble si los tenés.'],
  },
  gestor: {
    trade: { one: 'gestor', many: 'gestores' },
    about:
      'Gestores de {city} para trámites del automotor y otras gestiones. Contá qué trámite necesitás y recibí presupuestos.',
    jobs: ['Transferencias de autos y motos', 'Trámites del automotor', 'Gestiones ante organismos públicos'],
    tips: ['Indicá qué trámite es y para qué vehículo o persona.', 'Contá si ya tenés la documentación o hay que conseguirla.', 'Aclará si hay una fecha límite.'],
  },
  'desarrollador-freelance': {
    trade: { one: 'desarrollador', many: 'desarrolladores' },
    about:
      'Desarrolladores freelance de {city} para páginas web, sistemas y aplicaciones. Contá tu idea y recibí presupuestos.',
    jobs: ['Páginas web', 'Tiendas online', 'Sistemas a medida', 'Mantenimiento de sitios existentes'],
    tips: ['Describí qué querés lograr y para quién es.', 'Sumá ejemplos de sitios o apps que te gusten.', 'Contá si ya tenés dominio, hosting o diseño.'],
  },
};

export const SERVICE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const capitalize = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/** Cómo se nombra a quien hace el trabajo ("plomero"/"plomeros"); sin oficio propio, "profesional de …". */
export function tradeOf(service: Pick<LandingService, 'name' | 'slug'>): { one: string; many: string; feminine?: boolean } {
  return (
    SERVICE_GUIDES[service.slug]?.trade ?? {
      one: `profesional de ${service.name.toLowerCase()}`,
      many: `profesionales de ${service.name.toLowerCase()}`,
    }
  );
}

export function landingCopy(service: LandingService, place?: LandingPlace | null): LandingCopy {
  const guide = SERVICE_GUIDES[service.slug] ?? null;
  const own = guide?.trade;
  const { one, many } = tradeOf(service);
  const a = own?.feminine ? 'una' : 'un';
  const where = place ? ` en ${place.name}` : '';
  // "Plomero en Tandil": así se busca. Sin oficio propio, el nombre del servicio ("Fletes en Tandil").
  const title = place
    ? own
      ? `${capitalize(own.one)} en ${place.name} · ${service.name} | Resuelve`
      : `${service.name} en ${place.name} · Resuelve`
    : own
      ? `${capitalize(own.many)} · ${service.name} | Resuelve`
      : `${service.name} · Resuelve`;
  const faq = [
    {
      question: `¿Cómo consigo ${a} ${one}${where}?`,
      answer: `Contá en Resuelve qué necesitás, en qué localidad y barrio es y para cuándo. Los ${many} que trabajan en tu zona te mandan su presupuesto; los comparás y elegís con quién coordinar.`,
    },
    {
      question: `¿Cuánto cobra ${a} ${one}?`,
      answer: `Depende del trabajo. En Resuelve cada ${one} te manda su presupuesto para tu caso, así comparás antes de decidir. Resuelve no fija el precio ni cobra comisión por el trabajo.`,
    },
    ...(service.requiresLicense
      ? [
          {
            question: `¿Los ${many} están matriculados?`,
            // Solo lo que se verifica de verdad: el número, contra el registro oficial que revisa una persona.
            answer: `Los que muestran «Matrícula verificada» cargaron su número y Resuelve lo revisó en el registro oficial correspondiente. Si un perfil no la muestra, pedile la matrícula al profesional antes de contratar.`,
          },
        ]
      : []),
  ];
  const about = guide ? placeText(guide.about, place) : null;
  return {
    title,
    description:
      about ??
      (place
        ? `${service.name} en ${place.name}: contá qué necesitás, recibí presupuestos de profesionales que trabajan en ${place.name}, compará y elegí con quién coordinar el trabajo.`
        : `${service.name}: contá qué necesitás, recibí presupuestos de profesionales que trabajan en tu ciudad, compará y elegí con quién coordinar el trabajo.`),
    heading: own ? `${capitalize(own.many)}${where}` : `${service.name}${where}`,
    kicker: own ? service.name : null,
    guide: guide ? { ...guide, about: about! } : null,
    intro:
      about ??
      `Contanos qué necesitás y los profesionales de ${service.name.toLowerCase()} ${place ? `de ${place.name}` : 'de tu ciudad'} te responden con su presupuesto. Vos comparás y elegís.`,
    steps: [
      { title: 'Contá qué necesitás', text: 'Describí el trabajo, en qué localidad y barrio es y para cuándo lo querés.' },
      {
        title: 'Recibí presupuestos',
        text: place
          ? `Los profesionales que trabajan en ${place.name} y cubren tu zona te mandan su propuesta.`
          : 'Los profesionales que trabajan en tu localidad y cubren tu zona te mandan su propuesta.',
      },
      { title: 'Elegí y coordiná', text: 'Elegís al profesional, acuerdan el día y la hora, y el trabajo queda agendado.' },
    ],
    licenseNote: service.requiresLicense
      ? 'Los profesionales que muestran «Matrícula verificada» cargaron su número y Resuelve lo revisó en el registro oficial correspondiente. Sin el sello, la matrícula no está verificada por Resuelve.'
      : null,
    professionalsHeading: place ? `${capitalize(many)} de ${place.name} en Resuelve` : `${capitalize(many)} en Resuelve`,
    faq,
  };
}

/** Profesional real que ofrece el servicio (de `GET /professionals?service=`). Solo datos públicos del perfil. */
export interface LandingProfessional {
  slug: string;
  displayName: string;
  headline: string | null;
  averageRating: number | null;
  reviewsCount: number;
}

/** Máximo de perfiles listados en la página de un servicio. */
export const LANDING_PROFESSIONALS_LIMIT = 12;

/** Solo perfiles con enlace público (slug); el rating, solo si hay reseñas reales. */
export function landingProfessionals(items: unknown): LandingProfessional[] {
  if (!Array.isArray(items)) return [];
  return items
    .filter((p): p is LandingProfessional => !!p && typeof p.slug === 'string' && SERVICE_SLUG.test(p.slug) && typeof p.displayName === 'string')
    .slice(0, LANDING_PROFESSIONALS_LIMIT)
    .map((p) => ({
      slug: p.slug,
      displayName: p.displayName,
      headline: typeof p.headline === 'string' && p.headline.trim() ? p.headline.trim() : null,
      averageRating: typeof p.averageRating === 'number' && p.reviewsCount > 0 ? p.averageRating : null,
      reviewsCount: typeof p.reviewsCount === 'number' ? p.reviewsCount : 0,
    }));
}

/** "4,8 ★ · 12 reseñas"; null sin reseñas (nunca un rating inventado). */
export function ratingText(p: LandingProfessional): string | null {
  if (p.averageRating === null || p.reviewsCount < 1) return null;
  return `${p.averageRating.toFixed(1).replace('.', ',')} ★ · ${p.reviewsCount} ${p.reviewsCount === 1 ? 'reseña' : 'reseñas'}`;
}

/** Datos estructurados: el servicio (la localidad como zona general, sin contacto), las migas de pan y las preguntas. */
export function landingJsonLd(service: LandingService, origin: string, place?: LandingPlace | null): Record<string, unknown> {
  const url = `${origin}${landingPath(service, place)}`;
  const nationalUrl = `${origin}${landingPath(service)}`;
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Service',
        '@id': `${url}#service`,
        name: place ? `${service.name} en ${place.name}` : service.name,
        serviceType: service.name,
        ...(SERVICE_GUIDES[service.slug]?.trade
          ? { alternateName: `${capitalize(tradeOf(service).one)}${place ? ` en ${place.name}` : ''}` }
          : {}),
        url,
        ...(place
          ? {
              areaServed: {
                '@type': 'City',
                name: place.name,
                containedInPlace: { '@type': 'AdministrativeArea', name: place.province.name },
              },
            }
          : { areaServed: { '@type': 'Country', name: 'Argentina' } }),
        provider: { '@id': `${origin}/#organization` },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Resuelve', item: `${origin}/` },
          { '@type': 'ListItem', position: 2, name: 'Servicios', item: `${origin}/servicios` },
          { '@type': 'ListItem', position: 3, name: service.name, item: nationalUrl },
          ...(place ? [{ '@type': 'ListItem', position: 4, name: place.name, item: url }] : []),
        ],
      },
      {
        '@type': 'FAQPage',
        '@id': `${url}#faq`,
        mainEntity: landingCopy(service, place).faq.map((f) => ({
          '@type': 'Question',
          name: f.question,
          acceptedAnswer: { '@type': 'Answer', text: f.answer },
        })),
      },
    ],
  };
}
