/**
 * Contenido de la página pública de un servicio (`/servicios/:slug`). Única fuente: la comparte la página de Angular
 * y `api/service-page.ts` (HTML para buscadores). Solo dice lo que el producto hace: nada de precios, cantidades ni
 * profesionales inventados.
 */
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
  about: string;
  jobs: string[];
  tips: string[];
}

export const SERVICE_GUIDES: Record<string, ServiceGuide> = {
  electricidad: {
    about:
      'Desde un tomacorriente que no anda hasta un tablero nuevo: contá qué pasa y los electricistas matriculados de Tandil te responden con su presupuesto.',
    jobs: ['Tableros y térmicas', 'Cortocircuitos y cortes de luz en la casa', 'Tomas e interruptores', 'Iluminación y ventiladores', 'Instalaciones nuevas'],
    tips: ['Contá qué pasó y desde cuándo (por ejemplo, si salta la térmica al usar un aparato).', 'Si podés, sumá fotos del tablero o de la zona afectada.', 'Mientras tanto, no manipules instalaciones que saltan o chispean.'],
  },
  gas: {
    about:
      'Instalaciones, artefactos y revisiones de gas con gasistas matriculados de Tandil. Describí el trabajo y compará los presupuestos que recibas.',
    jobs: ['Instalaciones de gas', 'Calefactores y estufas', 'Calefones y termotanques', 'Pruebas de hermeticidad', 'Detección de fugas'],
    tips: ['Indicá qué artefacto es y, si lo sabés, la marca y el modelo.', 'Si sentís olor a gas, ventilá, no uses fuego ni interruptores y llamá a la empresa de gas.', 'Para trabajos de gas pedí siempre un profesional matriculado.'],
  },
  plomeria: {
    about:
      'Pérdidas, canillas, destapaciones y más: contanos qué pasa en tu casa y los plomeros de Tandil te mandan su presupuesto.',
    jobs: ['Pérdidas y filtraciones', 'Griferías y canillas', 'Termotanques', 'Destapaciones', 'Sanitarios', 'Cañerías'],
    tips: ['Contá dónde está el problema y desde cuándo.', 'Una foto o un video corto de la pérdida ayuda a entender el trabajo.', 'Si el agua no para, cerrá la llave de paso mientras esperás.'],
  },
  cerrajeria: {
    about:
      'Cerraduras, aperturas y copias de llaves en Tandil. Si es una urgencia, marcalo en tu pedido para recibir respuestas de quienes pueden hoy.',
    jobs: ['Aperturas de puertas', 'Cambio de cerraduras', 'Copias de llaves', 'Cerraduras de seguridad', 'Arreglo de puertas que no cierran'],
    tips: ['Indicá el tipo de puerta (madera, metal, blindada) y de cerradura si lo sabés.', 'Decí si es una urgencia y desde dónde estás.', 'Elegí a quien tenga buenas opiniones de clientes reales.'],
  },
  'aire-acondicionado': {
    about:
      'Instalación, limpieza y reparación de aires acondicionados con profesionales de Tandil. Contanos qué equipo tenés y qué necesitás.',
    jobs: ['Instalación de equipos', 'Carga de gas', 'Limpieza y mantenimiento', 'Reparaciones'],
    tips: ['Contá marca, modelo y tipo de equipo (split, ventana, inverter).', 'Si falla, describí qué hace o qué no hace.', 'Para una instalación, indicá dónde iría la unidad interior y la exterior.'],
  },
  pintura: {
    about:
      'Pintura de interiores y exteriores en Tandil: describí los ambientes y recibí presupuestos de pintores de la ciudad.',
    jobs: ['Pintura de interiores', 'Pintura de exteriores', 'Impermeabilización', 'Enduido y reparaciones de paredes'],
    tips: ['Contá cuántos ambientes o metros son y el estado de las paredes.', 'Sumá fotos, sobre todo si hay humedad o descascarados.', 'Aclará si querés que el profesional ponga los materiales.'],
  },
  albanileria: {
    about:
      'Arreglos y obras chicas de albañilería en Tandil. Contá qué querés resolver y compará presupuestos de albañiles de la ciudad.',
    jobs: ['Humedad', 'Revoques', 'Contrapisos', 'Pequeñas reformas', 'Arreglos de paredes y pisos'],
    tips: ['Describí el trabajo con medidas aproximadas si las tenés.', 'Subí fotos del lugar para que el presupuesto sea más preciso.', 'Aclará si necesitás que se encargue también de los materiales.'],
  },
  carpinteria: {
    about:
      'Muebles a medida, arreglos y trabajos en madera con carpinteros de Tandil. Describí lo que necesitás y recibí presupuestos.',
    jobs: ['Muebles a medida', 'Arreglo de puertas y ventanas de madera', 'Placares y bajo mesadas', 'Reparación de muebles', 'Estantes y trabajos en madera'],
    tips: ['Indicá medidas aproximadas y dónde va el mueble.', 'Una foto o un dibujo simple de lo que imaginás ayuda mucho.', 'Aclará el material y el acabado que preferís.'],
  },
  herreria: {
    about:
      'Rejas, portones, escaleras y otros trabajos en metal con herreros de Tandil. Contanos qué necesitás.',
    jobs: ['Rejas y protecciones', 'Portones y puertas', 'Escaleras y barandas', 'Estructuras y soldaduras', 'Reparaciones en metal'],
    tips: ['Indicá medidas aproximadas y si es para interior o exterior.', 'Sumá fotos del lugar donde va el trabajo.', 'Aclará si lo querés pintado o con otro terminado.'],
  },
  'reparacion-de-electrodomesticos': {
    about:
      'Si un electrodoméstico dejó de funcionar, contá qué pasa y los técnicos de Tandil te responden con su presupuesto.',
    jobs: ['Lavarropas', 'Heladeras', 'Cocinas y hornos', 'Microondas y otros electrodomésticos chicos'],
    tips: ['Indicá marca, modelo y qué falla (o qué ruido hace).', 'Decí cuánto hace que tiene el problema.', 'Una foto de la etiqueta con el modelo ayuda al técnico.'],
  },
  'corte-de-pasto': {
    about:
      'Corte de pasto para jardines y terrenos de Tandil. Contá el tamaño del lugar y cada cuánto lo necesitás.',
    jobs: ['Corte de pasto en casas', 'Corte en terrenos', 'Bordeado y prolijado', 'Servicio periódico'],
    tips: ['Indicá los metros aproximados del jardín o terreno.', 'Aclará si es una vez o un servicio periódico.', 'Contá si hay que retirar el pasto cortado.'],
  },
  jardineria: {
    about:
      'Mantenimiento y armado de jardines en Tandil. Contanos qué querés lograr y recibí presupuestos de jardineros de la ciudad.',
    jobs: ['Mantenimiento de jardines', 'Plantación y armado de canteros', 'Cuidado de plantas', 'Riego', 'Arreglo de espacios verdes'],
    tips: ['Describí el espacio y qué querés cambiar o mantener.', 'Sumá fotos del jardín actual.', 'Aclará si querés un servicio único o periódico.'],
  },
  poda: {
    about:
      'Poda de árboles, arbustos y setos en Tandil. Contá qué hay que podar y recibí presupuestos.',
    jobs: ['Poda de árboles', 'Poda de arbustos y setos', 'Retiro de ramas', 'Extracción de ramas peligrosas'],
    tips: ['Indicá la altura aproximada y la cantidad de árboles.', 'Subí fotos desde distintos ángulos.', 'Aclará si hay cables o construcciones cerca.'],
  },
  'limpieza-de-terrenos': {
    about:
      'Limpieza y desmalezado de terrenos en Tandil. Describí el lugar y recibí presupuestos de profesionales de la ciudad.',
    jobs: ['Desmalezado', 'Limpieza de terrenos baldíos', 'Retiro de escombros y residuos', 'Preparación del terreno'],
    tips: ['Indicá los metros aproximados del terreno.', 'Contá qué hay que sacar (yuyos, escombros, restos de obra).', 'Una foto del estado actual ayuda a cotizar.'],
  },
  fletes: {
    about:
      'Fletes para llevar muebles, electrodomésticos u otras cargas dentro de Tandil. Contá qué se transporta y recibí presupuestos.',
    jobs: ['Traslado de muebles y electrodomésticos', 'Entregas de compras grandes', 'Cargas dentro de la ciudad'],
    tips: ['Listá lo que hay que llevar y, si podés, tamaños aproximados.', 'Indicá el origen, el destino y si hay escaleras o ascensor.', 'Aclará si necesitás ayuda para cargar y descargar.'],
  },
  mudanzas: {
    about:
      'Mudanzas en Tandil: contá desde dónde y hacia dónde te mudás y recibí presupuestos de profesionales de la ciudad.',
    jobs: ['Mudanzas de casas y departamentos', 'Traslado de muebles', 'Embalaje y carga', 'Mudanzas chicas'],
    tips: ['Indicá el tamaño de la vivienda y qué se lleva.', 'Contá si hay escaleras o ascensor en origen y destino.', 'Aclará la fecha deseada para coordinar con tiempo.'],
  },
  'retiro-de-muebles': {
    about:
      'Retiro de muebles y objetos que ya no querés, en Tandil. Contá qué hay que sacar y recibí presupuestos.',
    jobs: ['Retiro de muebles usados', 'Retiro de electrodomésticos', 'Vaciado de ambientes', 'Retiro de objetos voluminosos'],
    tips: ['Listá lo que se retira y sumá fotos.', 'Indicá el piso y si hay escaleras o ascensor.', 'Aclará si hay que desarmar algo antes de sacarlo.'],
  },
  'camaras-y-alarmas': {
    about:
      'Instalación y revisión de cámaras y alarmas en casas y comercios de Tandil. Contanos qué querés cubrir.',
    jobs: ['Instalación de cámaras', 'Alarmas', 'Revisión de sistemas existentes', 'Ampliaciones'],
    tips: ['Indicá cuántas zonas querés vigilar y si son interiores o exteriores.', 'Contá si ya tenés equipos instalados.', 'Aclará si querés poder ver las cámaras desde el celular.'],
  },
  redes: {
    about:
      'Redes de internet y WiFi para casas y comercios de Tandil: cobertura, cableado y configuración. Contá qué problema querés resolver.',
    jobs: ['Instalación de WiFi', 'Mejora de cobertura', 'Cableado de red', 'Configuración de equipos'],
    tips: ['Contá el tamaño del lugar y dónde está el módem.', 'Describí qué falla (zonas sin señal, cortes, lentitud).', 'Indicá si ya tenés equipos o hay que comprarlos.'],
  },
  'reparacion-de-pc': {
    about:
      'Reparación y mantenimiento de computadoras en Tandil. Contá qué le pasa a tu equipo y recibí presupuestos.',
    jobs: ['Diagnóstico de fallas', 'Limpieza y mantenimiento', 'Reinstalación de sistema', 'Cambio de componentes'],
    tips: ['Indicá si es notebook o PC de escritorio, marca y modelo.', 'Describí qué falla o qué mensajes muestra.', 'Si tenés información importante, avisá para que se resguarde.'],
  },
};

export const SERVICE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function landingCopy(service: LandingService): LandingCopy {
  return {
    title: `${service.name} en Tandil · Resuelve`,
    description:
      SERVICE_GUIDES[service.slug]?.about ??
      `${service.name} en Tandil: contá qué necesitás, recibí presupuestos de profesionales de la ciudad, compará y elegí con quién coordinar el trabajo.`,
    heading: `${service.name} en Tandil`,
    guide: SERVICE_GUIDES[service.slug] ?? null,
    intro: SERVICE_GUIDES[service.slug]?.about ?? `Contanos qué necesitás y los profesionales de ${service.name.toLowerCase()} de Tandil te responden con su presupuesto. Vos comparás y elegís.`,
    steps: [
      { title: 'Contá qué necesitás', text: 'Describí el trabajo, dónde es y para cuándo lo querés.' },
      { title: 'Recibí presupuestos', text: 'Los profesionales de Tandil que cubren tu zona te mandan su propuesta.' },
      { title: 'Elegí y coordiná', text: 'Elegís al profesional, acuerdan el día y la hora, y el trabajo queda agendado.' },
    ],
    licenseNote: service.requiresLicense
      ? 'Este servicio requiere matrícula: Resuelve verifica el número de matrícula de cada profesional en el registro oficial.'
      : null,
  };
}

/** Datos estructurados: el servicio (zona general Tandil, sin contacto) y las migas de pan. */
export function landingJsonLd(service: LandingService, origin: string): Record<string, unknown> {
  const url = `${origin}/servicios/${service.slug}`;
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Service',
        '@id': `${url}#service`,
        name: `${service.name} en Tandil`,
        serviceType: service.name,
        url,
        areaServed: { '@type': 'City', name: 'Tandil' },
        provider: { '@id': `${origin}/#organization` },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Resuelve', item: `${origin}/` },
          { '@type': 'ListItem', position: 2, name: 'Servicios', item: `${origin}/servicios` },
          { '@type': 'ListItem', position: 3, name: service.name, item: url },
        ],
      },
    ],
  };
}
