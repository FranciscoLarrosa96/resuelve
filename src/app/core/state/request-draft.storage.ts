import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { MAX_INVITATIONS, RequestUrgency } from '../models/request';
import { ConfirmedRequestLocation, PropertyType, RequestFlowMode, ServiceRequestDraft } from '../models/service-request';
import type { RecipientRef } from './request.store';

const KEY = 'resuelve.requestDraft';
/** v3: conserva ubicación confirmada en sessionStorage durante el borrador (máx. 12 h). */
const VERSION = 3;
/** Un borrador más viejo que esto se descarta al volver. */
export const DRAFT_TTL_MS = 12 * 60 * 60 * 1000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const URGENCIES: RequestUrgency[] = ['FLEXIBLE', 'TODAY', 'URGENT'];

/**
 * Lo que sobrevive a un F5 o al redirect a /ingresar. La ubicación exacta
 * solo se persiste después de confirmarla, en sessionStorage durante 12 h;
 * nunca se guarda una búsqueda incompleta, tokens, usuario ni fotos.
 * Incluye servicio, zona, textos, urgencia y fecha deseada,
 * referencias PÚBLICAS de los profesionales elegidos, el contexto del flujo
 * (dirigido o no, y si hay que volver a "Solicitar presupuesto") y el id de
 * una solicitud ya creada que quedó sin invitar (para no crear otra).
 */
export interface StoredDraft {
  draft: ServiceRequestDraft;
  recipients: RecipientRef[];
  pendingRequestId: string | null;
  flowMode: RequestFlowMode;
  returnToQuote: boolean;
}

interface Envelope extends StoredDraft {
  v: number;
  savedAt: number;
}

@Injectable({ providedIn: 'root' })
export class RequestDraftStorage {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  /** Devuelve el borrador válido y vigente, o null (y limpia si no sirve). */
  read(now = Date.now()): StoredDraft | null {
    if (!this.browser) return null;
    let raw: string | null = null;
    try {
      raw = sessionStorage.getItem(KEY);
    } catch {
      return null;
    }
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as Envelope;
      if (isValid(parsed) && now - parsed.savedAt < DRAFT_TTL_MS && parsed.savedAt <= now) {
        // v1 guardaba además una etiqueta `when` ("Hoy"): se descarta, "Cuándo" sale de desiredDate.
        const draft: ServiceRequestDraft & { when?: string } = {
          ...parsed.draft,
          location: parsed.draft.location ?? null,
        };
        delete draft.when;
        // v1 no persistía intención de entrada. No inferirla del número de destinatarios.
        const flowMode = parsed.v === 1 || parsed.flowMode !== 'TARGETED' || parsed.recipients.length !== 1
          ? 'DISCOVERY'
          : 'TARGETED';
        return {
          draft,
          recipients: parsed.recipients,
          pendingRequestId: parsed.pendingRequestId,
          flowMode,
          returnToQuote: parsed.returnToQuote === true,
        };
      }
    } catch {
      /* JSON inválido: se descarta */
    }
    this.clear();
    return null;
  }

  write(value: StoredDraft, now = Date.now()): void {
    if (!this.browser) return;
    const { draft } = value;
    const envelope: Envelope = {
      v: VERSION,
      savedAt: now,
      // Copia explícita campo por campo: nada más que esto llega a sessionStorage.
      draft: {
        id: draft.id,
        ...(draft.sourceRequestId ? { sourceRequestId: draft.sourceRequestId } : {}),
        description: draft.description,
        service: { id: draft.service.id, slug: draft.service.slug, name: draft.service.name },
        title: draft.title,
        urgency: draft.urgency,
        zone: draft.zone ? { id: draft.zone.id, name: draft.zone.name } : null,
        desiredDate: draft.desiredDate,
        location: draft.location ? { ...draft.location } : null,
      },
      recipients: value.recipients.slice(0, MAX_INVITATIONS).map((p) => ({
        id: p.id,
        displayName: p.displayName,
        firstName: p.firstName,
        avatarUrl: p.avatarUrl,
        averageRating: p.averageRating,
        reviewsCount: p.reviewsCount,
        availableToday: p.availableToday,
        ...(p.serviceIds ? { serviceIds: p.serviceIds.slice(0, 50) } : {}),
        ...(p.coversEntireCity !== undefined ? { coversEntireCity: p.coversEntireCity } : {}),
        ...(p.zoneIds ? { zoneIds: p.zoneIds.slice(0, 100) } : {}),
      })),
      pendingRequestId: value.pendingRequestId,
      flowMode: value.flowMode,
      returnToQuote: value.returnToQuote,
    };
    try {
      sessionStorage.setItem(KEY, JSON.stringify(envelope));
    } catch {
      /* sin almacenamiento: el borrador dura lo que dure la página */
    }
  }

  clear(): void {
    if (!this.browser) return;
    try {
      sessionStorage.removeItem(KEY);
    } catch {
      /* nada que limpiar */
    }
  }
}

const isString = (v: unknown): v is string => typeof v === 'string';
const isUuidList = (v: unknown) => v === undefined || (Array.isArray(v) && v.every((x) => isString(x) && UUID.test(x)));

function isValid(e: Envelope | null): e is Envelope {
  if (!e || ![1, 2, VERSION].includes(e.v) || typeof e.savedAt !== 'number') return false;
  const d = e.draft;
  if (!d || !isString(d.id) || !isString(d.description) || !isString(d.title)) return false;
  if (e.v === VERSION && e.flowMode !== 'DISCOVERY' && e.flowMode !== 'TARGETED') return false;
  if (d.description.length > 2000 || d.title.length > 140) return false;
  if (!URGENCIES.includes(d.urgency)) return false;
  if (!d.service || !isString(d.service.slug) || !isString(d.service.name)) return false;
  if (d.service.id !== null && !(isString(d.service.id) && UUID.test(d.service.id))) return false;
  if (d.zone !== null && !(d.zone && isString(d.zone.id) && UUID.test(d.zone.id) && isString(d.zone.name))) return false;
  if (d.desiredDate !== null && !(isString(d.desiredDate) && /^\d{4}-\d{2}-\d{2}$/.test(d.desiredDate))) return false;
  if (d.location !== undefined && d.location !== null && !validLocation(d.location)) return false;
  if (!Array.isArray(e.recipients) || e.recipients.length > MAX_INVITATIONS) return false;
  if (!e.recipients.every((p) => p && isString(p.id) && UUID.test(p.id) && isString(p.displayName))) return false;
  if (!e.recipients.every((p) => isUuidList(p.serviceIds) && isUuidList(p.zoneIds))) return false;
  if (e.pendingRequestId !== null && !(isString(e.pendingRequestId) && UUID.test(e.pendingRequestId))) return false;
  return true;
}

function validLocation(value: ConfirmedRequestLocation): boolean {
  const propertyTypes: PropertyType[] = ['HOUSE', 'APARTMENT', 'OTHER'];
  return !!value && isString(value.address) && value.address.length <= 240 &&
    isString(value.formattedAddress) && value.formattedAddress.length <= 500 &&
    typeof value.latitude === 'number' && Number.isFinite(value.latitude) && value.latitude >= -90 && value.latitude <= 90 &&
    typeof value.longitude === 'number' && Number.isFinite(value.longitude) && value.longitude >= -180 && value.longitude <= 180 &&
    (value.providerPlaceId === null || (isString(value.providerPlaceId) && value.providerPlaceId.length <= 255)) &&
    (value.propertyType === null || propertyTypes.includes(value.propertyType)) &&
    (value.floor === null || (isString(value.floor) && value.floor.length <= 40)) &&
    (value.unit === null || (isString(value.unit) && value.unit.length <= 80));
}
