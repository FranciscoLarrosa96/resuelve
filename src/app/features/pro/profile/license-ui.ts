import { LicenseStatus } from '../../../core/models/pro-profile';

/**
 * Textos ÚNICOS del estado de una matrícula (perfil y servicios). La lógica
 * compara siempre el estado del backend, nunca estas etiquetas.
 * "Verificada" = Resuelve comprobó el número en el registro oficial; no es una
 * garantía de calidad ni una recomendación.
 */
export type LicenseTone = 'ok' | 'pending' | 'danger' | 'neutral';

export interface LicenseUi {
  /** Chip corto junto al servicio. */
  chip: string;
  tone: LicenseTone;
  title: string;
  detail: string;
  /** Acción disponible (null = nada que hacer por ahora). */
  action: string | null;
}

export const LICENSE_UI: Record<Exclude<LicenseStatus, 'NOT_REQUIRED'>, LicenseUi> = {
  NOT_SUBMITTED: {
    chip: 'Matrícula pendiente',
    tone: 'neutral',
    title: 'Sin enviar',
    detail: 'Todavía no verificamos esta matrícula. Hasta entonces no aparecés en búsquedas de este servicio.',
    action: 'Enviar matrícula',
  },
  PENDING: {
    chip: 'Matrícula en revisión',
    tone: 'pending',
    title: 'En revisión',
    detail: 'Estamos verificando el número en el registro oficial.',
    action: null,
  },
  VERIFIED: {
    chip: 'Matrícula verificada',
    tone: 'ok',
    title: 'Matrícula verificada',
    detail: 'Esta matrícula fue revisada por Resuelve.',
    action: null,
  },
  REJECTED: {
    chip: 'Matrícula rechazada',
    tone: 'danger',
    title: 'No pudimos verificar la matrícula',
    detail: 'Revisá el motivo y volvé a enviar el número.',
    action: 'Volver a enviar',
  },
  EXPIRED: {
    chip: 'Matrícula vencida',
    tone: 'neutral',
    title: 'La matrícula venció',
    detail: 'Enviá el número de tu matrícula vigente para volver a aparecer en búsquedas de este servicio.',
    action: 'Enviar de nuevo',
  },
};

export const LICENSE_TONES: Record<LicenseTone, string> = {
  ok: 'bg-brand-soft text-brand-dark',
  pending: 'bg-accent-soft text-accent-ink',
  danger: 'bg-danger-soft text-danger',
  neutral: 'bg-neutral-soft text-neutral',
};
