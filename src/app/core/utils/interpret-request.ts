import { CategoryName } from '../models/category';

export interface Interpretation {
  category: CategoryName;
  problem: string;
}

/**
 * Clasificación simulada del texto libre del cliente.
 * Más adelante la reemplaza el backend / modelo real.
 */
export function interpretRequest(text: string): Interpretation {
  const s = text.toLowerCase();
  if (/termotanque|calef[oó]n/.test(s) && /pierde|agua|p[eé]rdida/.test(s))
    return { category: 'Plomería', problem: 'Termotanque con pérdida' };
  if (/pileta|mesada|bacha/.test(s)) return { category: 'Plomería', problem: 'Pérdida bajo mesada' };
  if (/inodoro|ba[ñn]o|canilla|ca[ñn]o|agua|pierde|p[eé]rdida|destap/.test(s))
    return { category: 'Plomería', problem: 'Pérdida de agua' };
  if (/t[eé]rmica|disyuntor|cortocircuito/.test(s))
    return { category: 'Electricidad', problem: 'Saltan las térmicas' };
  if (/ventilador/.test(s)) return { category: 'Electricidad', problem: 'Instalación de ventilador' };
  if (/luz|enchufe|toma|tablero|el[eé]ctric/.test(s))
    return { category: 'Electricidad', problem: 'Problema eléctrico' };
  if (/gas|estufa|calefactor/.test(s)) return { category: 'Gas', problem: 'Revisión de gas' };
  if (/llave|afuera|cerradura|puerta/.test(s)) return { category: 'Cerrajería', problem: 'Apertura de puerta' };
  if (/aire|split/.test(s))
    return { category: 'Aire acondicionado', problem: 'Instalación de aire acondicionado' };
  if (/pint/.test(s)) return { category: 'Pintura', problem: 'Pintura de ambientes' };
  if (/pared|humedad|revoque|alba/.test(s)) return { category: 'Albañilería', problem: 'Arreglo de humedad' };
  return { category: 'Plomería', problem: 'Consulta general' };
}
