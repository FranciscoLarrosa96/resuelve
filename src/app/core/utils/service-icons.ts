import type { ServiceGlyph } from '../../shared/components/icon/service-icon';

/**
 * Único mapa de presentación `service.slug → ícono`. El catálogo del backend
 * sigue siendo la fuente de los datos; esto es solo cómo se dibuja. Un
 * servicio nuevo sin entrada usa el ícono neutro y la UI no se rompe.
 */
export const SERVICE_ICONS: Readonly<Record<string, ServiceGlyph>> = {
  electricidad: 'zap',
  gas: 'flame',
  plomeria: 'droplets',
  cerrajeria: 'key',
  'aire-acondicionado': 'snowflake',
  pintura: 'paint-roller',
  albanileria: 'brick-wall',
  carpinteria: 'hammer',
  herreria: 'anvil',
  'reparacion-de-electrodomesticos': 'plug',
  'corte-de-pasto': 'scissors',
  jardineria: 'leaf',
  poda: 'tree',
  'limpieza-de-terrenos': 'shovel',
  fletes: 'truck',
  mudanzas: 'package',
  'retiro-de-muebles': 'sofa',
  'camaras-y-alarmas': 'cctv',
  redes: 'network',
  'reparacion-de-pc': 'monitor',
  'limpieza-de-interior': 'sparkles',
  ninera: 'baby',
  'desarrollador-freelance': 'code',
  contador: 'calculator',
  gestor: 'file-text',
  abogado: 'scale',
  martillero: 'house',
};

/** Ícono neutro para servicios sin entrada (o sin servicio todavía). */
export const FALLBACK_SERVICE_ICON: ServiceGlyph = 'wrench';

export function serviceIcon(slug: string | null | undefined): ServiceGlyph {
  return (slug && SERVICE_ICONS[slug]) || FALLBACK_SERVICE_ICON;
}
