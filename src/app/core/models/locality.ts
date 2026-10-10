/**
 * Catálogo geográfico nacional (backend `/provinces`, `/localities`): provincia →
 * localidad → barrio. Una localidad se identifica por id o por (provincia, slug):
 * nunca solo por el nombre (hay "San Martín" en muchas provincias).
 */
export interface Province {
  id: string;
  name: string;
  slug: string;
  officialCode: string;
}

/** Lo mínimo para mostrar y volver a pedir una localidad (también se guarda en localStorage). */
export interface LocalityRef {
  id: string;
  name: string;
  slug: string;
  province: { name: string; slug: string };
  /** "Tandil, Buenos Aires" o, con homónimos en la provincia, "El Rincón (Caucete), San Juan". */
  label: string;
  /** `provincia/localidad` (URLs semánticas). */
  path: string;
}

/** Resultado del autocompletar. */
export interface LocalityOption extends LocalityRef {
  department: string | null;
  /** Ya hay profesionales que la cubren (solo orienta el orden; no promete disponibilidad). */
  hasProfessionals: boolean;
}

/** GET /localities/:id y /provinces/:p/localities/:l. */
export interface LocalityDetail extends LocalityRef {
  department: string | null;
  /** Tiene barrios cargados: el pedido y la cobertura eligen barrio. Sin barrios = ciudad completa. */
  hasNeighborhoods: boolean;
  /** Perfiles públicos que cubren la localidad (agregado). */
  professionalsCount: number;
  /** Con `?service=`: de ese servicio. */
  serviceProfessionalsCount?: number;
}

/** GET /localities/served: localidades con oferta real. */
export interface ServedLocality extends LocalityRef {
  professionalsCount: number;
}

/** "Tandil, Buenos Aires" a partir de lo que devuelve el backend en cualquier lugar. */
export function localityLabel(
  l: { name: string; province?: { name: string } | null; label?: string } | null | undefined,
): string {
  if (!l) return '';
  return l.label ?? (l.province ? `${l.name}, ${l.province.name}` : l.name);
}

/** Un `LocalityRef` válido a partir de lo que vino del backend o del storage. */
export function toLocalityRef(l: {
  id: string;
  name: string;
  slug: string;
  province: { name: string; slug: string } | null;
  label?: string;
  path?: string;
}): LocalityRef | null {
  if (!l?.id || !l.province) return null;
  return {
    id: l.id,
    name: l.name,
    slug: l.slug,
    province: { name: l.province.name, slug: l.province.slug },
    label: l.label ?? `${l.name}, ${l.province.name}`,
    path: l.path ?? `${l.province.slug}/${l.slug}`,
  };
}
