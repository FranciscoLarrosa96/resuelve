/** Colores del avatar con iniciales (fallback cuando no hay foto). */
export interface AvatarTone {
  bg: string;
  fg: string;
}

/** Lo mínimo que necesita un avatar para dibujarse. */
export interface AvatarSubject {
  name: string;
  initials: string;
  tone: AvatarTone;
  photoUrl?: string | null;
}

const TONES: AvatarTone[] = [
  { bg: '#E4EFE9', fg: '#1E5B4B' },
  { bg: '#F6E3D3', fg: '#8A4A1E' },
  { bg: '#E6ECF3', fg: '#2F4B6E' },
  { bg: '#E8E4F1', fg: '#4B3F7A' },
];

/** Tono estable a partir de un id (el mismo profesional siempre con el mismo color). */
export function toneFor(id: string): AvatarTone {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return TONES[Math.abs(hash) % TONES.length];
}

export function initialsOf(firstName: string, lastName: string): string {
  return `${firstName.trim().charAt(0)}${lastName.trim().charAt(0)}`.toUpperCase();
}

/** Avatar de un profesional real: foto persistida por el backend o iniciales (nombre + apellido). */
export function avatarOf(p: {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  firstName?: string;
  lastName?: string;
}): AvatarSubject {
  const words = p.displayName.trim().split(/\s+/);
  const initials =
    p.firstName && p.lastName
      ? initialsOf(p.firstName, p.lastName)
      : `${words[0]?.charAt(0) ?? ''}${words.length > 1 ? words[words.length - 1].charAt(0) : ''}`.toUpperCase();
  return { name: p.displayName, initials, tone: toneFor(p.id), photoUrl: p.avatarUrl };
}
