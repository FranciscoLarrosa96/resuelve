import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { MAX_INVITATIONS, RequestUrgency } from '../models/request';
import { ServiceRequestDraft } from '../models/service-request';
import type { RecipientRef } from './request.store';

const KEY = 'resuelve.requestDraft';
const VERSION = 1;
/** Un borrador más viejo que esto se descarta al volver. */
export const DRAFT_TTL_MS = 12 * 60 * 60 * 1000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const URGENCIES: RequestUrgency[] = ['FLEXIBLE', 'TODAY', 'URGENT'];

/**
 * Lo único del pedido que sobrevive a un F5 o al redirect a /ingresar.
 * Solo datos no sensibles: servicio, zona, textos, urgencia, fecha deseada,
 * referencias PÚBLICAS de los profesionales elegidos y el id de una
 * solicitud ya creada que quedó sin invitar (para no crear otra).
 * NO se guarda: dirección exacta, tokens, datos del usuario ni fotos.
 */
export interface StoredDraft {
  draft: ServiceRequestDraft;
  recipients: RecipientRef[];
  pendingRequestId: string | null;
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
        return { draft: parsed.draft, recipients: parsed.recipients, pendingRequestId: parsed.pendingRequestId };
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
        when: draft.when,
        desiredDate: draft.desiredDate,
      },
      recipients: value.recipients.slice(0, MAX_INVITATIONS).map((p) => ({
        id: p.id,
        displayName: p.displayName,
        firstName: p.firstName,
        avatarUrl: p.avatarUrl,
        averageRating: p.averageRating,
        reviewsCount: p.reviewsCount,
        availableToday: p.availableToday,
      })),
      pendingRequestId: value.pendingRequestId,
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

function isValid(e: Envelope | null): e is Envelope {
  if (!e || e.v !== VERSION || typeof e.savedAt !== 'number') return false;
  const d = e.draft;
  if (!d || !isString(d.id) || !isString(d.description) || !isString(d.title) || !isString(d.when)) return false;
  if (d.description.length > 2000 || d.title.length > 140) return false;
  if (!URGENCIES.includes(d.urgency)) return false;
  if (!d.service || !isString(d.service.slug) || !isString(d.service.name)) return false;
  if (d.service.id !== null && !(isString(d.service.id) && UUID.test(d.service.id))) return false;
  if (d.zone !== null && !(d.zone && isString(d.zone.id) && UUID.test(d.zone.id) && isString(d.zone.name))) return false;
  if (d.desiredDate !== null && !(isString(d.desiredDate) && /^\d{4}-\d{2}-\d{2}$/.test(d.desiredDate))) return false;
  if (!Array.isArray(e.recipients) || e.recipients.length > MAX_INVITATIONS) return false;
  if (!e.recipients.every((p) => p && isString(p.id) && UUID.test(p.id) && isString(p.displayName))) return false;
  if (e.pendingRequestId !== null && !(isString(e.pendingRequestId) && UUID.test(e.pendingRequestId))) return false;
  return true;
}
