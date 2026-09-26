/** Textos accesibles de los badges de navegación (el número solo no alcanza). */

/** "2 novedades en Mis solicitudes" (incluye el texto visible del enlace). */
export function newsLabel(count: number, place: string): string {
  return `${count} ${count === 1 ? 'novedad' : 'novedades'} en ${place}`;
}

/** "Agenda, 1 trabajo pendiente de cierre" */
export function completionDueLabel(count: number): string {
  return `Agenda, ${count} ${count === 1 ? 'trabajo pendiente' : 'trabajos pendientes'} de cierre`;
}
