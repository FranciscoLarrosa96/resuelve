import { toLocalityRef } from '../../../core/models/locality';
import { ServiceSpecialties } from '../../../core/models/pro-profile';
import { CoverageDraft } from '../../../shared/components/coverage-editor/coverage-editor';

/**
 * Borrador del alta profesional, guardado en este navegador y por cuenta.
 *
 * - Solo lo que la persona cargó en el alta (oficios, cobertura, título, presentación y años). Nunca
 *   contraseñas, tokens, números de contacto ni comprobantes.
 * - Una clave por cuenta (`…:v2:<id>`) y el id también viaja dentro del borrador: otra cuenta del mismo
 *   navegador no lo recupera.
 * - Vence a las 24 h de inactividad (cada guardado renueva `savedAt`).
 * - `rev` crece con cada guardado: una pestaña que quedó atrás no pisa en silencio lo que otra guardó
 *   después (`save` devuelve `conflict` y no escribe).
 * - Lee también el borrador anterior (versión 1, `sessionStorage`, 5 pasos) y lo adapta a los 4 pasos.
 * - Sin almacenamiento (modo privado, bloqueado) nada se rompe: `unavailable`.
 */
export const DRAFT_VERSION = 2;
export const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
export const DRAFT_KEY_PREFIX = 'resuelve:onboarding-pro:';
/** Pasos del alta: servicios, dónde, perfil, revisar. */
export const WIZARD_LAST_STEP = 4;

export interface OnboardingDraft {
  v: typeof DRAFT_VERSION;
  userId: string;
  savedAt: number;
  rev: number;
  step: number;
  serviceIds: string[];
  specialties: ServiceSpecialties[];
  coverage: CoverageDraft[];
  primaryLocalityId: string | null;
  headline: string;
  /** La persona escribió o borró el título: nunca se vuelve a completar solo. */
  headlineEdited: boolean;
  /** Último título puesto por la sugerencia (si sigue igual, todavía no es "de la persona"). */
  headlineAuto: string | null;
  bio: string;
  /** null = no informado. */
  yearsExperience: number | null;
  /** Solo viene de un borrador anterior (el paso de urgencias ya no está en el alta). */
  availableToday: boolean;
}

export type DraftSaveResult = 'saved' | 'conflict' | 'unavailable';

export const draftKey = (userId: string): string => `${DRAFT_KEY_PREFIX}v${DRAFT_VERSION}:${userId}`;
const legacyKey = (userId: string): string => `${DRAFT_KEY_PREFIX}${userId}`;

/** Cada cuánto se renueva el plazo de 24 h cuando no hubo cambios de contenido. */
const TOUCH_AFTER_MS = 5 * 60 * 1000;

/** JSON con las claves ordenadas (a todo nivel): el orden de las propiedades no cuenta. */
const stable = (value: unknown): string =>
  JSON.stringify(value, (_k, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  );

const sameContent = (a: OnboardingDraft, b: Omit<OnboardingDraft, 'v' | 'rev' | 'savedAt'>): boolean => {
  const strip = (d: Partial<OnboardingDraft>) => {
    const { v: _v, rev: _rev, savedAt: _savedAt, ...rest } = d;
    return stable(rest);
  };
  return strip(a) === strip(b);
};

const isStr = (x: unknown): x is string => typeof x === 'string';

/** Hay algo cargado más allá del paso 1 vacío (para avisar "retomamos lo que habías cargado"). */
export function hasContent(d: OnboardingDraft): boolean {
  return (
    d.step > 1 ||
    d.serviceIds.length > 0 ||
    d.coverage.length > 0 ||
    d.headline.trim() !== '' ||
    d.bio.trim() !== '' ||
    d.yearsExperience !== null
  );
}

type Common = Pick<
  OnboardingDraft,
  'serviceIds' | 'specialties' | 'coverage' | 'primaryLocalityId' | 'headline' | 'bio' | 'availableToday'
>;

function sanitizeCommon(raw: Record<string, unknown>): Common {
  const specialties = Array.isArray(raw['specialties'])
    ? (raw['specialties'] as ServiceSpecialties[]).filter(
        (e) => e && isStr(e.serviceId) && Array.isArray(e.names) && e.names.every(isStr),
      )
    : [];
  // Borradores de antes de multiciudad no tenían localidad: se vuelve a elegir (no se asume una ciudad).
  const coverage: CoverageDraft[] = Array.isArray(raw['coverage'])
    ? (raw['coverage'] as CoverageDraft[]).flatMap((c) => {
        const locality = c && toLocalityRef(c.locality);
        return locality
          ? [{ locality, coversEntireCity: c.coversEntireCity === true, zoneIds: Array.isArray(c.zoneIds) ? c.zoneIds.filter(isStr) : [] }]
          : [];
      })
    : [];
  const primary = raw['primaryLocalityId'];
  return {
    serviceIds: Array.isArray(raw['serviceIds']) ? (raw['serviceIds'] as unknown[]).filter(isStr) : [],
    specialties,
    coverage,
    primaryLocalityId: coverage.some((c) => c.locality.id === primary) ? (primary as string) : (coverage[0]?.locality.id ?? null),
    headline: isStr(raw['headline']) ? raw['headline'] : '',
    bio: isStr(raw['bio']) ? raw['bio'] : '',
    availableToday: raw['availableToday'] === true,
  };
}

/** Lee y valida un borrador v2; null si no sirve (otra cuenta, vencido, ilegible). */
export function parseDraft(raw: string | null, userId: string, now: number): OnboardingDraft | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    if (!o || o['v'] !== DRAFT_VERSION || o['userId'] !== userId) return null;
    const savedAt = o['savedAt'];
    if (typeof savedAt !== 'number' || now - savedAt > DRAFT_TTL_MS) return null;
    const step = o['step'];
    const years = o['yearsExperience'];
    const headlineAuto = o['headlineAuto'];
    return {
      ...sanitizeCommon(o),
      v: DRAFT_VERSION,
      userId,
      savedAt,
      rev: Number.isInteger(o['rev']) && (o['rev'] as number) >= 0 ? (o['rev'] as number) : 0,
      step: Number.isInteger(step) && (step as number) >= 1 && (step as number) <= WIZARD_LAST_STEP ? (step as number) : 1,
      headlineEdited: o['headlineEdited'] === true,
      headlineAuto: isStr(headlineAuto) ? headlineAuto : null,
      yearsExperience: Number.isInteger(years) && (years as number) >= 0 && (years as number) <= 70 ? (years as number) : null,
    };
  } catch {
    return null;
  }
}

/**
 * Borrador de la versión anterior (5 pasos, `sessionStorage`). El paso 4 (urgencias) ya no existe y el 5 pasa a
 * ser el 4. Un título ya escrito se toma como de la persona. Los años: el 0 de esa versión era el valor
 * inicial y no se distingue de uno elegido; un 0 nunca se muestra en el perfil, así que pasa a "no informado".
 */
export function parseLegacyDraft(raw: string | null, userId: string, now: number): OnboardingDraft | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    const savedAt = o?.['savedAt'];
    if (!o || typeof savedAt !== 'number' || now - savedAt > DRAFT_TTL_MS) return null;
    const oldStep = Number.isInteger(o['step']) ? (o['step'] as number) : 1;
    const step = oldStep <= 1 ? 1 : oldStep === 2 ? 2 : oldStep === 3 || oldStep === 4 ? 3 : 4;
    const years = o['yearsExperience'];
    const common = sanitizeCommon(o);
    return {
      ...common,
      v: DRAFT_VERSION,
      userId,
      savedAt,
      rev: 0,
      step,
      headlineEdited: common.headline.trim() !== '',
      headlineAuto: null,
      yearsExperience: Number.isInteger(years) && (years as number) > 0 && (years as number) <= 70 ? (years as number) : null,
    };
  } catch {
    return null;
  }
}

/** Acceso al almacenamiento sin lanzar: devuelve null si no hay. */
export type StorageGetter = () => Storage | null;

const browserStorage =
  (kind: 'localStorage' | 'sessionStorage'): StorageGetter =>
  () => {
    try {
      return typeof window === 'undefined' ? null : window[kind];
    } catch {
      return null;
    }
  };

export class OnboardingDraftStore {
  /** Revisión del borrador con la que está sincronizada esta pestaña. */
  private baseRev = 0;

  private readonly local: StorageGetter;
  private readonly session: StorageGetter;

  constructor(
    local: StorageGetter = browserStorage('localStorage'),
    session: StorageGetter = browserStorage('sessionStorage'),
    private readonly now: () => number = () => Date.now(),
  ) {
    // Pedir el almacenamiento puede lanzar (bloqueado por el navegador): nunca rompe el alta.
    const safe = (get: StorageGetter): StorageGetter => () => {
      try {
        return get();
      } catch {
        return null;
      }
    };
    this.local = safe(local);
    this.session = safe(session);
  }

  /** El borrador guardado (v2, o el anterior adaptado) y lo deja como base de esta pestaña. */
  load(userId: string): OnboardingDraft | null {
    const stored = this.peek(userId);
    if (stored) {
      this.baseRev = stored.rev;
      return stored;
    }
    this.baseRev = 0;
    try {
      return parseLegacyDraft(this.session()?.getItem(legacyKey(userId)) ?? null, userId, this.now());
    } catch {
      return null;
    }
  }

  /** Lo guardado ahora, sin cambiar la base (para detectar cambios de otra pestaña). */
  peek(userId: string): OnboardingDraft | null {
    try {
      const key = draftKey(userId);
      const store = this.local();
      const raw = store?.getItem(key) ?? null;
      const draft = parseDraft(raw, userId, this.now());
      if (!draft && raw) store?.removeItem(key); // vencido o ilegible
      return draft;
    } catch {
      return null;
    }
  }

  /** Otra pestaña guardó algo más nuevo que lo que esta pestaña conoce. */
  hasNewerElsewhere(userId: string): boolean {
    const stored = this.peek(userId);
    return !!stored && stored.rev > this.baseRev;
  }

  /** Aceptar lo que guardó otra pestaña como punto de partida. */
  adopt(draft: OnboardingDraft): void {
    this.baseRev = draft.rev;
  }

  /** Guarda si esta pestaña está al día; si otra guardó después, no escribe (salvo `force`, una decisión de la persona). */
  save(draft: Omit<OnboardingDraft, 'v' | 'rev' | 'savedAt'>, force = false): DraftSaveResult {
    const store = this.local();
    if (!store) return 'unavailable';
    try {
      const current = this.peek(draft.userId);
      if (current && current.rev > this.baseRev && !force) return 'conflict';
      // Sin cambios de contenido no se sube la revisión: abrir otra pestaña y no tocar nada no es un conflicto.
      // Solo se renueva el plazo de 24 h (sin cambiar `rev`) cuando ya pasó un rato.
      if (current && sameContent(current, draft)) {
        if (this.now() - current.savedAt > TOUCH_AFTER_MS) {
          store.setItem(draftKey(draft.userId), JSON.stringify({ ...current, savedAt: this.now() }));
        }
        this.baseRev = Math.max(this.baseRev, current.rev);
        return 'saved';
      }
      const rev = Math.max(current?.rev ?? 0, this.baseRev) + 1;
      store.setItem(draftKey(draft.userId), JSON.stringify({ ...draft, v: DRAFT_VERSION, rev, savedAt: this.now() }));
      this.baseRev = rev;
      return 'saved';
    } catch {
      return 'unavailable';
    }
  }

  /** Al crear el perfil o al descartar: se borra el actual y el de la versión anterior. */
  clear(userId: string): void {
    this.baseRev = 0;
    try {
      this.local()?.removeItem(draftKey(userId));
    } catch {
      /* almacenamiento no disponible */
    }
    try {
      this.session()?.removeItem(legacyKey(userId));
    } catch {
      /* almacenamiento no disponible */
    }
  }
}
