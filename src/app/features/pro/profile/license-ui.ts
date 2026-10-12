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
  // Nunca "pendiente" ni "en revisión" sin un envío: todavía no mandó nada.
  NOT_SUBMITTED: {
    chip: 'Matrícula sin verificar',
    tone: 'neutral',
    title: 'Sin verificar',
    detail: 'Todavía no enviaste tu matrícula. Es opcional: ya aparecés en este servicio. Si la enviás y la verificamos, tu perfil muestra «Matrícula verificada».',
    action: 'Enviar matrícula',
  },
  PENDING: {
    chip: 'Matrícula en revisión',
    tone: 'pending',
    title: 'En revisión',
    detail: 'Recibimos tu matrícula: estamos verificando el número en el registro oficial. Mientras tanto aparecés igual en este servicio.',
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
    chip: 'Matrícula a corregir',
    tone: 'danger',
    title: 'Requiere corrección',
    detail: 'No pudimos verificar la matrícula que enviaste. Revisá el motivo y volvé a enviarla.',
    action: 'Volver a enviar',
  },
  EXPIRED: {
    chip: 'Matrícula vencida',
    tone: 'neutral',
    title: 'Vencida',
    detail: 'Seguís apareciendo en este servicio. Enviá el número de tu matrícula vigente para volver a mostrarla verificada.',
    action: 'Enviar de nuevo',
  },
};

export const LICENSE_TONES: Record<LicenseTone, string> = {
  ok: 'bg-brand-soft text-brand-dark',
  pending: 'bg-accent-soft text-accent-ink',
  danger: 'bg-danger-soft text-danger',
  neutral: 'bg-neutral-soft text-neutral',
};
