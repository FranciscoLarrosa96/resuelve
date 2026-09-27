import { DEFAULT_PROBLEM_BY_SERVICE } from '../data/catalog.data';

/**
 * Clasificación del texto libre del cliente ("PC", "pierde agua", "me quedé
 * afuera") a un servicio del catálogo. Determinística y por niveles:
 *
 *  1. Frases/alias exactos del servicio ("pc", "notebook", "me quede afuera"),
 *     como palabras completas → peso fuerte.
 *  2. Palabras clave y el nombre real del servicio (tokens completos; las que
 *     terminan en `*` son raíces: "pint*" = pintar, pintura, pintor) → peso
 *     medio o débil.
 *  3. Sin una coincidencia fuerte y única: NO se elige nada. Se devuelven las
 *     2–3 opciones reales con puntaje (o ninguna) y la UI pide elegir.
 *
 * Antes era una lista de regex por substring con un fallback fijo a Plomería:
 * "PC" no coincidía con nada y caía en "Plomería · Consulta general", y
 * palabras sueltas como "toma" o "agua" matcheaban dentro de otras.
 *
 * Los slugs son los del catálogo del backend (la fuente funcional); esto es
 * solo vocabulario de búsqueda. Un servicio sin términos se encuentra igual
 * por su nombre.
 */

interface ServiceTerms {
  /** Nivel 1: frases que por sí solas identifican el servicio. */
  aliases: string[];
  /** Nivel 2: palabras que apuntan al servicio pero pueden aparecer en otros. */
  keywords: string[];
  /** Palabras débiles (ambiguas por sí solas: "agua", "puerta", "luz"). */
  weak?: string[];
  /** Título más específico según lo que describe (el primero que coincide). */
  problems?: { any: string[]; title: string }[];
}

const STRONG = 3;
const MEDIUM = 2;
const WEAK = 1;
/** Puntaje mínimo para afirmar "Entendimos esto" sin preguntar. */
export const CONFIDENT_SCORE = 2;

export const SERVICE_TERMS: Record<string, ServiceTerms> = {
  'reparacion-de-pc': {
    aliases: ['pc', 'pcs', 'computadora', 'computadoras', 'compu', 'notebook', 'notebooks', 'laptop', 'netbook',
      'computacion', 'ordenador', 'formatear pc', 'formatear la pc', 'reparar pc', 'formatear', 'windows'],
    keywords: ['virus', 'monitor', 'teclado', 'disco rigido', 'placa de video', 'no prende la pc', 'lenta', 'pantalla azul'],
    problems: [{ any: ['formatear', 'windows', 'virus', 'lenta'], title: 'Formateo y puesta a punto' }],
  },
  redes: {
    aliases: ['wifi', 'wi fi', 'router', 'red de internet', 'cableado de red', 'repetidor'],
    keywords: ['internet', 'modem', 'señal', 'senal', 'red'],
  },
  'camaras-y-alarmas': {
    aliases: ['camara de seguridad', 'camaras de seguridad', 'alarma', 'alarmas', 'cctv', 'dvr', 'videovigilancia'],
    keywords: ['camara', 'camaras', 'sensor', 'monitoreo'],
  },
  plomeria: {
    aliases: ['pierde agua', 'perdida de agua', 'se tapo', 'destapacion', 'destapar', 'plomero', 'plomeria', 'gotea'],
    keywords: ['canilla', 'inodoro', 'cano', 'canos', 'caneria', 'pileta', 'bacha', 'mesada', 'desague', 'cloaca',
      'termotanque', 'griferia', 'filtracion', 'mochila', 'sifon', 'tanque de agua', 'bidet', 'ducha'],
    weak: ['agua', 'pierde', 'perdida', 'bano', 'tapado', 'tapada'],
    problems: [
      { any: ['termotanque'], title: 'Termotanque con pérdida' },
      { any: ['pileta', 'mesada', 'bacha'], title: 'Pérdida bajo mesada' },
      { any: ['tapo', 'tapado', 'tapada', 'destap*', 'desague', 'cloaca'], title: 'Destapación' },
      { any: ['inodoro', 'mochila'], title: 'Arreglo de inodoro' },
    ],
  },
  electricidad: {
    aliases: ['salta la termica', 'saltan las termicas', 'salta el disyuntor', 'cortocircuito', 'electricista',
      'se corto la luz', 'sin luz'],
    keywords: ['termica', 'termicas', 'disyuntor', 'enchufe', 'enchufes', 'tablero', 'electric*', 'toma corriente',
      'tomacorriente', 'cable', 'cables', 'ventilador', 'lampara', 'iluminacion', 'chispa'],
    weak: ['luz', 'luces', 'corto'],
    problems: [
      { any: ['termica', 'termicas', 'disyuntor', 'cortocircuito', 'corto'], title: 'Saltan las térmicas' },
      { any: ['ventilador'], title: 'Instalación de ventilador' },
    ],
  },
  gas: {
    aliases: ['olor a gas', 'perdida de gas', 'gasista', 'prueba de hermeticidad'],
    keywords: ['gas', 'estufa', 'calefactor', 'calefon', 'hornalla', 'garrafa', 'caldera', 'cocina a gas'],
    problems: [{ any: ['olor'], title: 'Olor a gas' }],
  },
  cerrajeria: {
    aliases: ['me quede afuera', 'quede afuera', 'nos quedamos afuera', 'cerrajero', 'cerrajeria', 'abrir la puerta',
      'perdi las llaves', 'perdi la llave'],
    keywords: ['cerradura', 'llave', 'llaves', 'candado', 'traba', 'cerrojo', 'bombin'],
    weak: ['puerta', 'afuera'],
    problems: [{ any: ['cerradura', 'bombin', 'cerrojo'], title: 'Cambio de cerradura' }],
  },
  'aire-acondicionado': {
    aliases: ['aire acondicionado', 'split', 'carga de gas del aire'],
    keywords: ['aire', 'frio calor', 'climatizacion'],
  },
  pintura: {
    aliases: ['pintor', 'pintar', 'pintura'],
    keywords: ['pint*', 'enduido', 'impermeabiliz*'],
  },
  albanileria: {
    aliases: ['albanil', 'albanileria', 'revoque', 'contrapiso'],
    keywords: ['humedad', 'pared', 'paredes', 'grieta', 'rajadura', 'ladrillo', 'ladrillos', 'revocar', 'cemento', 'azulejo', 'ceramica'],
    problems: [{ any: ['humedad'], title: 'Arreglo de humedad' }],
  },
  carpinteria: {
    aliases: ['carpintero', 'carpinteria'],
    keywords: ['madera', 'mueble a medida', 'placard', 'bisagra', 'cajon', 'estante'],
  },
  herreria: {
    aliases: ['herrero', 'herreria', 'soldadura', 'soldar'],
    keywords: ['reja', 'rejas', 'porton', 'hierro', 'baranda'],
  },
  'reparacion-de-electrodomesticos': {
    aliases: ['electrodomestico', 'electrodomesticos', 'lavarropas', 'heladera', 'microondas', 'secarropas', 'lavavajillas'],
    keywords: ['horno electrico', 'freezer', 'licuadora'],
  },
  'corte-de-pasto': {
    aliases: ['cortar el pasto', 'corte de pasto', 'cortar pasto', 'desmalezar'],
    keywords: ['pasto', 'cesped', 'bordeadora'],
  },
  jardineria: {
    aliases: ['jardinero', 'jardineria'],
    keywords: ['jardin', 'plantas', 'canteros', 'riego'],
  },
  poda: {
    aliases: ['poda', 'podar'],
    keywords: ['arbol', 'arboles', 'ramas', 'cerco'],
  },
  'limpieza-de-terrenos': {
    aliases: ['limpieza de terreno', 'limpiar el terreno', 'limpiar terreno'],
    keywords: ['terreno', 'baldio', 'escombros', 'yuyos'],
  },
  fletes: {
    aliases: ['flete', 'fletes', 'fletero'],
    keywords: ['traslado', 'llevar', 'camioneta'],
  },
  mudanzas: {
    aliases: ['mudanza', 'mudanzas', 'mudarme', 'me mudo'],
    keywords: ['cajas', 'embalaje'],
  },
  'retiro-de-muebles': {
    aliases: ['retiro de muebles', 'retirar muebles', 'sacar muebles'],
    keywords: ['muebles viejos', 'colchon', 'sillon'],
  },
};

/** Minúsculas, sin tildes ni signos: "¿Salta la térmica?" → "salta la termica". */
export function normalizeQuery(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** ¿El término aparece como palabra(s) completa(s)? `pint*` = cualquier palabra que empiece con "pint". */
function hits(text: string, term: string): boolean {
  const t = normalizeQuery(term.replace(/\*$/, ''));
  if (!t) return false;
  if (term.endsWith('*')) return new RegExp(`(^| )${t}[a-z]*( |$)`).test(text);
  return ` ${text} `.includes(` ${t} `);
}

/** Palabras del nombre real que sirven para buscar ("Reparación de PC" → "pc"). */
const NAME_STOPWORDS = new Set(['de', 'y', 'la', 'el', 'los', 'las', 'reparacion', 'retiro', 'limpieza', 'corte']);
function nameTokens(name: string): string[] {
  return normalizeQuery(name)
    .split(' ')
    .filter((w) => w.length >= 2 && !NAME_STOPWORDS.has(w));
}

export interface CatalogEntry {
  slug: string;
  name: string;
}

export interface ServiceScore {
  serviceSlug: string;
  score: number;
}

/** Puntaje de cada servicio del catálogo para el texto (solo los que suman algo, de mayor a menor). */
export function scoreServices(text: string, catalog: readonly CatalogEntry[]): ServiceScore[] {
  const q = normalizeQuery(text);
  if (!q) return [];
  return catalog
    .map(({ slug, name }) => {
      const terms = SERVICE_TERMS[slug];
      let score = 0;
      if (terms) {
        if (terms.aliases.some((a) => hits(q, a))) score += STRONG;
        score += terms.keywords.filter((k) => hits(q, k)).length * MEDIUM;
        score += (terms.weak ?? []).filter((k) => hits(q, k)).length * WEAK;
      }
      // El nombre real del catálogo también cuenta (un servicio nuevo sin términos se encuentra igual).
      if (nameTokens(name).some((w) => hits(q, w))) score = Math.max(score, STRONG);
      return { serviceSlug: slug, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);
}

export type Interpretation =
  | {
      kind: 'match';
      /** Slug del servicio en el catálogo del backend ("reparacion-de-pc"). */
      serviceSlug: string;
      problem: string;
    }
  | {
      /** No estamos seguros: 0–3 servicios reales con puntaje, nunca uno elegido solo. */
      kind: 'uncertain';
      options: string[];
    };

function problemFor(slug: string, text: string, fallbackName: string): string {
  const q = normalizeQuery(text);
  const specific = SERVICE_TERMS[slug]?.problems?.find((p) => p.any.some((w) => hits(q, w)));
  return specific?.title ?? DEFAULT_PROBLEM_BY_SERVICE[slug] ?? fallbackName;
}

/**
 * Interpreta el texto del cliente contra el catálogo real. Solo afirma un
 * servicio con puntaje suficiente y sin empate; si no, devuelve las opciones
 * (máx. 3) para que el cliente elija. Nunca cae en "el primero del catálogo".
 */
export function interpretRequest(text: string, catalog: readonly CatalogEntry[]): Interpretation {
  const scores = scoreServices(text, catalog);
  const [best, second] = scores;
  if (best && best.score >= CONFIDENT_SCORE && (!second || best.score > second.score)) {
    const name = catalog.find((c) => c.slug === best.serviceSlug)?.name ?? '';
    return { kind: 'match', serviceSlug: best.serviceSlug, problem: problemFor(best.serviceSlug, text, name) };
  }
  return { kind: 'uncertain', options: scores.slice(0, 3).map((s) => s.serviceSlug) };
}
