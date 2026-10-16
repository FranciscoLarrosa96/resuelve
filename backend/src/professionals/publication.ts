import { EntityManager } from 'typeorm';
import type { ProfessionalProfile } from './professional-profile.entity';
import { publicationBlockers, type PublicationBlocker } from './professional-rules';

export interface PresentedPublication {
  /** true = se puede encontrar en Resuelve (activo, con un oficio aprobado y cobertura). */
  published: boolean;
  blockers: PublicationBlocker[];
  /** Oficios sugeridos que un admin todavía no revisó (solo se consultan si falta un oficio). */
  pendingSuggestions: { id: string; name: string }[];
}

/** Estado de publicación para el propio profesional (`/pro/me`). Nunca es público. */
export async function presentPublication(
  m: EntityManager,
  profile: Parameters<typeof publicationBlockers>[0] & Pick<ProfessionalProfile, 'userId'>,
): Promise<PresentedPublication> {
  const blockers = publicationBlockers(profile);
  const pendingSuggestions = blockers.includes('NO_SERVICE')
    ? await m.query<{ id: string; name: string }[]>(
        `SELECT id, name FROM service_suggestions WHERE user_id = $1 AND status = 'PENDING' ORDER BY created_at, id`,
        [profile.userId],
      )
    : [];
  return { published: blockers.length === 0, blockers, pendingSuggestions };
}

export async function hasPendingSuggestion(m: EntityManager, userId: string): Promise<boolean> {
  const [row] = await m.query<{ ok: boolean }[]>(
    `SELECT EXISTS (SELECT 1 FROM service_suggestions WHERE user_id = $1 AND status = 'PENDING') AS ok`,
    [userId],
  );
  return row.ok;
}
