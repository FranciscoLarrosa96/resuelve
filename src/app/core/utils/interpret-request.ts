export interface Interpretation {
  /** Slug del servicio en el catálogo del backend ("plomeria"). */
  serviceSlug: string;
  problem: string;
  /** false = el texto no coincidió con ningún rubro (se devolvió el genérico). */
  matched: boolean;
}

/**
 * Clasificación simulada del texto libre del cliente.
 * Más adelante la reemplaza el backend / modelo real.
 * Las destapaciones van a Plomería: el catálogo no tiene un servicio aparte.
 */
export function interpretRequest(text: string): Interpretation {
  const s = text.toLowerCase();
  const hit = (serviceSlug: string, problem: string): Interpretation => ({ serviceSlug, problem, matched: true });
  if (/termotanque|calef[oó]n/.test(s) && /pierde|agua|p[eé]rdida/.test(s)) return hit('plomeria', 'Termotanque con pérdida');
  if (/pileta|mesada|bacha/.test(s)) return hit('plomeria', 'Pérdida bajo mesada');
  if (/inodoro|ba[ñn]o|canilla|ca[ñn]o|agua|pierde|p[eé]rdida|destap/.test(s)) return hit('plomeria', 'Pérdida de agua');
  if (/t[eé]rmica|disyuntor|cortocircuito/.test(s)) return hit('electricidad', 'Saltan las térmicas');
  if (/ventilador/.test(s)) return hit('electricidad', 'Instalación de ventilador');
  if (/luz|enchufe|toma|tablero|el[eé]ctric/.test(s)) return hit('electricidad', 'Problema eléctrico');
  if (/gas|estufa|calefactor/.test(s)) return hit('gas', 'Revisión de gas');
  if (/llave|afuera|cerradura|puerta/.test(s)) return hit('cerrajeria', 'Apertura de puerta');
  if (/aire|split/.test(s)) return hit('aire-acondicionado', 'Instalación de aire acondicionado');
  if (/pint/.test(s)) return hit('pintura', 'Pintura de ambientes');
  if (/pared|humedad|revoque|alba/.test(s)) return hit('albanileria', 'Arreglo de humedad');
  return { serviceSlug: 'plomeria', problem: 'Consulta general', matched: false };
}
