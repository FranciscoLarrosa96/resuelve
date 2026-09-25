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
  /** Texto visible: "Ahora", "Hoy", "Mañana", "Lun 28/9". */
  when: string;
  /** La misma fecha en YYYY-MM-DD: viaja como `desiredDate`. */
  desiredDate: string | null;
}

/** 0 servicio · 1 urgencia · 2 barrio · 3 cuándo · 4 revisión. */
export type RequestStep = 0 | 1 | 2 | 3 | 4;
