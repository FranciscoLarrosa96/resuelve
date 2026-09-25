import { CategoryName } from '../models/category';

export interface Interpretation {
  category: CategoryName;
  problem: string;
  /** false = el texto no coincidió con ningún rubro (se devolvió el genérico). */
  matched: boolean;
}

/**
 * Clasificación simulada del texto libre del cliente.
 * Más adelante la reemplaza el backend / modelo real.
 */
export function interpretRequest(text: string): Interpretation {
  const s = text.toLowerCase();
  if (/termotanque|calef[oó]n/.test(s) && /pierde|agua|p[eé]rdida/.test(s))
    return { category: 'Plomería', problem: 'Termotanque con pérdida', matched: true };
  if (/pileta|mesada|bacha/.test(s)) return { category: 'Plomería', problem: 'Pérdida bajo mesada', matched: true };
  if (/inodoro|ba[ñn]o|canilla|ca[ñn]o|agua|pierde|p[eé]rdida|destap/.test(s))
    return { category: 'Plomería', problem: 'Pérdida de agua', matched: true };
  if (/t[eé]rmica|disyuntor|cortocircuito/.test(s))
    return { category: 'Electricidad', problem: 'Saltan las térmicas', matched: true };
  if (/ventilador/.test(s)) return { category: 'Electricidad', problem: 'Instalación de ventilador', matched: true };
  if (/luz|enchufe|toma|tablero|el[eé]ctric/.test(s))
    return { category: 'Electricidad', problem: 'Problema eléctrico', matched: true };
  if (/gas|estufa|calefactor/.test(s)) return { category: 'Gas', problem: 'Revisión de gas', matched: true };
  if (/llave|afuera|cerradura|puerta/.test(s)) return { category: 'Cerrajería', problem: 'Apertura de puerta', matched: true };
  if (/aire|split/.test(s))
    return { category: 'Aire acondicionado', problem: 'Instalación de aire acondicionado', matched: true };
  if (/pint/.test(s)) return { category: 'Pintura', problem: 'Pintura de ambientes', matched: true };
  if (/pared|humedad|revoque|alba/.test(s)) return { category: 'Albañilería', problem: 'Arreglo de humedad', matched: true };
  return { category: 'Plomería', problem: 'Consulta general', matched: false };
}
