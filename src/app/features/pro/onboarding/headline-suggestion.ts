/**
 * Título profesional sugerido en el alta: el nombre del primer oficio aprobado que eligió, siempre editable.
 *
 * Se completa solo si el título está vacío o es todavía el que puso la sugerencia; nunca pisa uno que la
 * persona escribió (ni uno que borró a propósito), ni al cambiar de oficios ni al retomar un borrador.
 * Sin oficio aprobado (solo uno sugerido en revisión) no hay sugerencia: escribe el suyo.
 */
export interface HeadlineState {
  headline: string;
  /** La persona lo escribió o lo borró. */
  edited: boolean;
  /** Lo último que puso la sugerencia. */
  auto: string | null;
}

export function applyHeadlineSuggestion(state: HeadlineState, suggestion: string | null): HeadlineState {
  if (state.edited) return state;
  const current = state.headline.trim();
  if (current !== '' && current !== state.auto) return state;
  return { headline: suggestion ?? '', edited: false, auto: suggestion };
}
