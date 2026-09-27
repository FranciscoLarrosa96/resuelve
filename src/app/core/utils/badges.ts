/** Textos accesibles de los badges de navegación (el número solo no alcanza). */

/** "2 novedades en Mis solicitudes" (incluye el texto visible del enlace). */
export function newsLabel(count: number, place: string): string {
  return `${count} ${count === 1 ? 'novedad' : 'novedades'} en ${place}`;
}

/** "Agenda, 1 trabajo pendiente de cierre" */
export function completionDueLabel(count: number): string {
  return `Agenda, ${count} ${count === 1 ? 'trabajo pendiente' : 'trabajos pendientes'} de cierre`;
}

/** "Agenda, 1 horario confirmado y 2 trabajos pendientes de cierre" (solo lo que hay). */
export function agendaLabel(confirmed: number, due: number): string {
  const parts = [
    confirmed ? `${confirmed} ${confirmed === 1 ? 'horario confirmado' : 'horarios confirmados'}` : '',
    due ? `${due} ${due === 1 ? 'trabajo pendiente' : 'trabajos pendientes'} de cierre` : '',
  ].filter(Boolean);
  return parts.length ? `Agenda, ${parts.join(' y ')}` : 'Agenda';
}

/** Pestaña con novedades: "Nuevas, 1 novedad". */
export function tabNewsLabel(label: string, count: number): string {
  return count ? `${label}, ${count} ${count === 1 ? 'novedad' : 'novedades'}` : label;
}
