import { ServiceRef } from './category';
import { RequestUrgency } from './request';

/** Urgencia del pedido: los mismos valores que el backend. */
export type Urgency = RequestUrgency;

/** Zona real elegida (GET /zones): el id es el que viaja como `zoneId`. */
export interface ZoneRef {
  id: string;
  name: string;
}

/** El pedido que arma el cliente antes de enviarlo (borrador local). */
export interface ServiceRequestDraft {
  /** Id local del borrador (el id real lo asigna el backend al crearlo). */
  id: string;
  /** Si se creó con "Crear solicitud similar", la solicitud de origen (solo referencia). */
  sourceRequestId?: string;
  /** Explicación completa del cliente, editable. */
  description: string;
  /** Servicio del catálogo real: id del backend + slug + nombre. */
  service: ServiceRef;
  /** Resumen corto editable ("Pérdida bajo mesada"). */
  title: string;
  urgency: Urgency;
  /** null hasta que el cliente elige un barrio real. */
  zone: ZoneRef | null;
  /**
   * ÚNICA fuente de "Cuándo": fecha de calendario YYYY-MM-DD (date-only, día
   * de Argentina) que viaja como `desiredDate`. null = el cliente todavía no
   * eligió. El texto visible ("Hoy", "Dom 4/10") se deriva siempre de acá:
   * no hay una etiqueta guardada aparte que pueda quedar vieja.
   */
  desiredDate: string | null;
}

/**
 * Cómo se armó el pedido (explícito; nunca se infiere de la URL):
 *  - DISCOVERY: el cliente describe el problema y después busca profesionales.
 *  - TARGETED: ya eligió a quién pedirle presupuesto (un perfil, una tarjeta,
 *    Urgencias o el comparador). Editar el pedido NO cambia eso; solo
 *    "Cambiar profesional" (o un cambio que lo vuelve inelegible) lo rompe.
 */
export type RequestFlowMode = 'DISCOVERY' | 'TARGETED';

/** 0 servicio · 1 urgencia · 2 barrio · 3 cuándo · 4 revisión. */
export type RequestStep = 0 | 1 | 2 | 3 | 4;
