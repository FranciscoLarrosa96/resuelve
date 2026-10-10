/**
 * Oficios más buscados con enlace en el pie (va en el HTML prerenderizado de todas las páginas públicas). Lista fija y
 * chica para no sumar las guías al bundle inicial; un test exige que coincida con `SERVICE_GUIDES` (`trade.many`).
 */
export const FOOTER_SERVICE_LINKS: { slug: string; label: string }[] = [
  { slug: 'plomeria', label: 'Plomeros' },
  { slug: 'electricidad', label: 'Electricistas' },
  { slug: 'gas', label: 'Gasistas' },
  { slug: 'cerrajeria', label: 'Cerrajeros' },
  { slug: 'pintura', label: 'Pintores' },
  { slug: 'albanileria', label: 'Albañiles' },
  { slug: 'carpinteria', label: 'Carpinteros' },
  { slug: 'herreria', label: 'Herreros' },
];
