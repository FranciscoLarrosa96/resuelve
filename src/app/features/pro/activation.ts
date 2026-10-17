import { OfferedService, OwnProfessional } from '../../core/models/pro-profile';

/**
 * Primer acceso del profesional: qué decirle y qué sugerirle, SOLO con datos
 * reales de /pro/me (y de sus fotos). Única fuente para la bienvenida del alta
 * (`/pro/bienvenida`), la tarjeta "¡Te damos la bienvenida a Resuelve!" del Inicio y el
 * estado de Mi perfil. Nada se marca "hecho" por tocar un botón: copiar o
 * compartir un enlace no prueba que alguien lo recibió.
 */

/** Cubre alguna localidad (toda la ciudad o algún barrio). */
export function hasCoverage(me: OwnProfessional): boolean {
  if (me.coverage) return me.coverage.some((c) => c.coversEntireCity || c.zones.length > 0);
  return me.coversEntireCity || me.zones.length > 0;
}

/**
 * ¿Puede aparecer en búsquedas? Mismos criterios que el backend: perfil activo,
 * algún servicio habilitado y dónde trabaja. No mira fotos, reseñas ni contacto.
 */
export type ProfileVisibility = 'VISIBLE' | 'PAUSED' | 'INCOMPLETE';

export function profileVisibility(me: OwnProfessional): ProfileVisibility {
  if (me.status !== 'ACTIVE') return 'PAUSED';
  return me.offeredServices.some((s) => s.public) && hasCoverage(me) ? 'VISIBLE' : 'INCOMPLETE';
}

/**
 * Sin ningún oficio aprobado (alta con un oficio sugerido): el perfil existe pero no se publica.
 * `names` son las sugerencias en revisión; vacío = ya se resolvieron y falta elegir un oficio.
 */
export function serviceGap(me: OwnProfessional | null | undefined): { names: string[] } | null {
  if (!me?.publication?.blockers.includes('NO_SERVICE')) return null;
  return { names: me.publication.pendingSuggestions.map((s) => s.name) };
}

/** Lo que falta para aparecer en búsquedas (perfil activo pero incompleto). */
export function visibilityGaps(me: OwnProfessional): string[] {
  const gaps: string[] = [];
  if (!me.offeredServices.some((s) => s.public)) gaps.push('un servicio habilitado');
  if (!hasCoverage(me)) gaps.push('dónde trabajás');
  return gaps;
}

/** "Mar del Plata", "Tandil y Azul", "Tandil, Azul y Olavarría". */
export function localitiesText(me: OwnProfessional): string {
  const names = (me.coverage ?? []).map((c) => c.locality.name);
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`;
}

/** Canales elegidos en "Cómo te contactan". Sin el dato (backend anterior): solo solicitudes. */
export function contactChannels(me: OwnProfessional): { whatsapp: boolean; calls: boolean; requests: boolean } {
  const c = me.contact;
  return c
    ? { whatsapp: c.whatsappEnabled, calls: c.callsEnabled, requests: c.requestsEnabled }
    : { whatsapp: false, calls: false, requests: true };
}

export function hasDirectContact(me: OwnProfessional): boolean {
  const c = contactChannels(me);
  return c.whatsapp || c.calls;
}

/** Cómo le llegan los clientes hoy, en una frase (lo que configuró, nunca lo que podría). */
export function contactReadyText(me: OwnProfessional): string {
  const c = contactChannels(me);
  const direct = c.whatsapp && c.calls ? 'escribirte por WhatsApp o llamarte' : c.whatsapp ? 'escribirte por WhatsApp' : c.calls ? 'llamarte' : null;
  if (direct && c.requests) return `Los clientes pueden ${direct} desde tu perfil, o enviarte una solicitud por Resuelve.`;
  if (direct) return `Los clientes pueden ${direct} desde tu perfil.`;
  return 'Los clientes pueden enviarte solicitudes por Resuelve.';
}

/** Servicios con matrícula que todavía no envió (es opcional: solo suma el sello). */
export function licensesToSend(me: OwnProfessional): OfferedService[] {
  return me.offeredServices.filter((s) => s.requiresLicense && s.licenseStatus === 'NOT_SUBMITTED');
}

export type ActivationTip = 'AVATAR' | 'SHARE' | 'PHOTOS' | 'REVIEW' | 'CONTACT';

/** Reseñas de cualquier tipo (por Resuelve o de clientes invitados). */
export function totalReviews(me: OwnProfessional): number {
  return (me.reviewsCount ?? 0) + (me.invitedReviewsCount ?? 0);
}

/**
 * Tarjeta "¡Te damos la bienvenida a Resuelve!" del Inicio. Se muestra a quien recién empieza:
 * - perfil visible en búsquedas (si no, no se le sugiere compartir como si pudiera recibir consultas);
 * - todavía sin primer cliente por Resuelve (`firstSuccessAt`): quien ya tuvo actividad mantiene su Inicio;
 * - y le falta alguna señal real de uso: fotos de trabajos o reseñas.
 * Descartada o con primer cliente, desaparece. `photos` null = todavía no se sabe (no se muestra).
 * Hasta tres sugerencias, en orden: primero completar el perfil (foto propia, fotos de
 * trabajos, WhatsApp o llamadas), después la primera reseña y, al final, compartirlo: con
 * el perfil incompleto, compartir no entra entre las tres. Compartir nunca se sugiere con el perfil sin publicar.
 *
 * `skip` son las que ya se mostraron o se dejaron para después en esta sesión (`ActivationSession`): no se
 * repiten enseguida y la siguiente ocupa su lugar. Que una esté salteada no cambia cuándo corresponde ninguna
 * otra, y su configuración sigue disponible en Mi perfil.
 */
export function activationTips(me: OwnProfessional, photos: number | null, skip: readonly ActivationTip[] = []): ActivationTip[] {
  if (photos === null || profileVisibility(me) !== 'VISIBLE' || me.firstSuccessAt) return [];
  const needsPhotos = photos === 0;
  const needsReview = totalReviews(me) === 0;
  const tips: ActivationTip[] = [];
  if (!me.avatarUrl) tips.push('AVATAR');
  if (needsPhotos) tips.push('PHOTOS');
  if (!hasDirectContact(me)) tips.push('CONTACT');
  if (needsReview) tips.push('REVIEW');
  // Compartir va último: se sugiere cuando lo que hace al perfil digno de mostrar ya está.
  if (me.avatarUrl && !needsPhotos && hasDirectContact(me)) tips.push('SHARE');
  return tips.filter((t) => !skip.includes(t)).slice(0, 3);
}
