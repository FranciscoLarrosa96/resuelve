import { ServiceRef } from './category';
import { LocalityRef } from './locality';
import { RequestUrgency } from './request';

/** Urgencia del pedido: los mismos valores que el backend. */
export type Urgency = RequestUrgency;

/** Zona real elegida (GET /zones): el id es el que viaja como `zoneId`. */
export interface ZoneRef {
  id: string;
  name: string;
}

/**
 * Localidad del TRABAJO (puede no ser donde vive el cliente). `hasNeighborhoods`
 * se completa al cargar sus barrios: con barrios, elegir uno es obligatorio.
 */
export interface DraftLocality extends LocalityRef {
  hasNeighborhoods?: boolean;
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
  /**
   * Dónde es el trabajo. Se define ANTES de distribuir el pedido: solo reciben
   * quienes cubren esta localidad. Ausente en borradores viejos (= la ciudad elegida).
   */
  locality?: DraftLocality | null;
  /** null hasta que el cliente elige un barrio real (o si la localidad no tiene barrios). */
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
 * Intención de entrada del pedido (explícita; nunca se infiere de cantidad,
 * resultados disponibles o URL):
 *  - DISCOVERY: el cliente describe el problema y después busca profesionales.
 *  - TARGETED: entró por una acción individual para pedirle presupuesto a un
 *    profesional. Editar el pedido NO cambia eso; sumar otro destinatario sí.
 */
export type RequestFlowMode = 'DISCOVERY' | 'TARGETED';

/**
 * Pasos del asistente por SIGNIFICADO (versión 2 de la interfaz, 4 pasos). Todo el código
 * habla de `REQUEST_STEPS.what`, nunca de un número: el orden puede cambiar sin que un
 * índice viejo (de la versión 1: urgencia y cuándo separados) apunte a otra pantalla.
 * El paso se guarda por nombre (nunca por índice); los borradores anteriores siguen siendo legibles.
 */
export const REQUEST_STEPS = { what: 0, where: 1, when: 2, review: 3 } as const;
export type RequestStep = (typeof REQUEST_STEPS)[keyof typeof REQUEST_STEPS];
export const FLOW_STEPS = 4;

/** Clave estable para retomar la pantalla, independiente del orden numérico. */
export type RequestStepName = keyof typeof REQUEST_STEPS;
