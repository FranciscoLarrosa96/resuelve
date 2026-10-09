/**
 * Oficios más buscados con enlace en el pie (va en el HTML prerenderizado de todas las páginas públicas). Lista fija y
 * chica para no sumar las guías al bundle inicial; un test exige que coincida con `SERVICE_GUIDES` (`trade.many`).
 */
export const FOOTER_SERVICE_LINKS: { slug: string; label: string }[] = [
  { slug: 'plomeria', label: 'Plomeros en Tandil' },
  { slug: 'electricidad', label: 'Electricistas en Tandil' },
  { slug: 'gas', label: 'Gasistas en Tandil' },
  { slug: 'cerrajeria', label: 'Cerrajeros en Tandil' },
  { slug: 'pintura', label: 'Pintores en Tandil' },
  { slug: 'albanileria', label: 'Albañiles en Tandil' },
  { slug: 'carpinteria', label: 'Carpinteros en Tandil' },
  { slug: 'herreria', label: 'Herreros en Tandil' },
];
