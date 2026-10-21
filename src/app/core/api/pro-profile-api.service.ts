import { HttpClient, HttpEvent } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  ContactSettingsInput,
  CreateProfessionalProfile,
  LicenseSubmission,
  OfferSurface,
  OwnProfessional,
  ProfessionalStatus,
  ProTrialSummary,
  UpdateProfessionalProfile,
  UploadTicket,
} from '../models/pro-profile';
import { Work } from '../models/professional';
import { API_URL } from './api.config';

export type { CreateProfessionalProfile, OwnProfessional } from '../models/pro-profile';

/** Respuesta de /pro/profile/works (y de cada acción sobre trabajos o fotos): la lista completa. */
export interface WorkList {
  /** Del más reciente al más viejo; cada uno con sus fotos en orden (0 = portada). */
  items: Work[];
  /** Trabajos activos que permite el plan (Free 1 / PRO 10), según entitlement. */
  maxWorks: number;
  activeWorks: number;
  maxStoredWorks: number;
  photosPerWork: number;
  /** Fotos visibles en el perfil público. */
  activePhotos: number;
  maxBytes: number;
}

/** Nombre, descripción y mes ("2026-03") de un trabajo. */
export interface WorkInput {
  pinned?: boolean;
  beforePhotoId?: string | null;
  afterPhotoId?: string | null;
  title: string;
  description: string | null;
  doneOn: string;
}

/**
 * Perfil propio del profesional autenticado (ProProfileController +
 * VerificationsController). Plan y uso existen en el contrato pero la UI no
 * los muestra hasta que los planes comerciales estén definidos.
 */
@Injectable({ providedIn: 'root' })
export class ProProfileApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_URL);

  startOnboarding(): Observable<{ professionalIntentAt: string }> {
    return this.http.post<{ professionalIntentAt: string }>(`${this.baseUrl}/pro/onboarding/start`, {});
  }

  createProfile(body: CreateProfessionalProfile): Observable<OwnProfessional> {
    return this.http.post<OwnProfessional>(`${this.baseUrl}/pro/profile`, body);
  }

  /**
   * "Quiero PRO": registra el pedido (idempotente). No cambia el plan. Con
   * oferta, solo viaja el código: el backend revalida y calcula el descuento.
   */
  requestPro(offerCode?: string): Observable<OwnProfessional> {
    return this.http.post<OwnProfessional>(`${this.baseUrl}/pro/plan/interest`, offerCode ? { offerCode } : {});
  }

  /** Embudo de la oferta (deduplicado por día en el backend; si no es elegible, se ignora). */
  offerEvent(type: 'SHOWN' | 'CLICKED', surface: OfferSurface, offerCode: string): Observable<{ recorded: boolean }> {
    return this.http.post<{ recorded: boolean }>(`${this.baseUrl}/pro/plan/offer-events`, { type, surface, offerCode });
  }

  getMe(): Observable<OwnProfessional> {
    return this.http.get<OwnProfessional>(`${this.baseUrl}/pro/me`);
  }

  /** Cierra el festejo de un premio por invitación (idempotente). */
  acknowledgeReferralCelebration(rewardId: string): Observable<{ acknowledged: true }> {
    return this.http.post<{ acknowledged: true }>(
      `${this.baseUrl}/pro/acquisition/referrals/celebrations/${rewardId}/ack`,
      {},
    );
  }

  /** "Probar PRO": activa la prueba (una vez, sin tarjeta). Devuelve /pro/me con el plan nuevo. */
  startProTrial(): Observable<OwnProfessional> {
    return this.http.post<OwnProfessional>(`${this.baseUrl}/pro/plan/trial`, {});
  }

  proTrialSummary(): Observable<ProTrialSummary> {
    return this.http.get<ProTrialSummary>(`${this.baseUrl}/pro/plan/trial/summary`);
  }

  acknowledgeProTrialSummary(): Observable<OwnProfessional> {
    return this.http.post<OwnProfessional>(`${this.baseUrl}/pro/plan/trial/summary/seen`, {});
  }

  acknowledgeFirstSuccess(): Observable<OwnProfessional> {
    return this.http.post<OwnProfessional>(`${this.baseUrl}/pro/first-success/acknowledge`, {});
  }

  updateProfile(patch: UpdateProfessionalProfile): Observable<OwnProfessional> {
    return this.http.patch<OwnProfessional>(`${this.baseUrl}/pro/profile`, patch);
  }

  /** Pausar / reactivar el perfil (no toca "Atiendo urgencias"). */
  setStatus(status: ProfessionalStatus): Observable<OwnProfessional> {
    return this.http.patch<OwnProfessional>(`${this.baseUrl}/pro/status`, { status });
  }

  /** PATCH /pro/availability: "Atiendo urgencias" (permanente hasta que lo cambie). */
  /** "¿Cómo querés que te contacten?": reemplaza la configuración y devuelve /pro/me. */
  setContact(body: ContactSettingsInput): Observable<OwnProfessional> {
    return this.http.patch<OwnProfessional>(`${this.baseUrl}/pro/contact`, body);
  }

  setAvailability(availableToday: boolean): Observable<OwnProfessional> {
    return this.http.patch<OwnProfessional>(`${this.baseUrl}/pro/availability`, { availableToday });
  }

  // ---- Matrícula ---------------------------------------------------------

  /** Firma temporal: el archivo va directo al almacenamiento privado, no a la API. */
  uploadTicket(serviceId: string): Observable<UploadTicket> {
    return this.http.post<UploadTicket>(`${this.baseUrl}/pro/verifications/upload`, { serviceId });
  }

  /**
   * Sube el archivo (documento de matrícula o foto) con la firma (multipart). Fuera de nuestra API: el
   * interceptor no agrega el token. Emite eventos para mostrar el progreso.
   */
  uploadFile(ticket: UploadTicket, file: File): Observable<HttpEvent<unknown>> {
    const form = new FormData();
    for (const [key, value] of Object.entries(ticket.fields)) form.append(key, value);
    form.append('file', file);
    return this.http.post(ticket.uploadUrl, form, { reportProgress: true, observe: 'events' });
  }

  // ---- Foto de perfil (pública) -------------------------------------------

  /** Firma para subir la foto directo a Cloudinary (carpeta del perfil, solo JPG/PNG/WebP). */
  avatarTicket(): Observable<UploadTicket> {
    return this.http.post<UploadTicket>(`${this.baseUrl}/pro/profile/avatar/upload`, {});
  }

  /** Confirma la foto subida (el backend valida formato y peso reales). */
  setAvatar(publicId: string): Observable<OwnProfessional> {
    return this.http.put<OwnProfessional>(`${this.baseUrl}/pro/profile/avatar`, { publicId });
  }

  /** Portada PRO: misma subida firmada que la foto de perfil, otra carpeta (403 PRO_REQUIRED sin PRO). */
  coverTicket(): Observable<UploadTicket> {
    return this.http.post<UploadTicket>(`${this.baseUrl}/pro/profile/cover/upload`, {});
  }

  setCover(publicId: string): Observable<OwnProfessional> {
    return this.http.put<OwnProfessional>(`${this.baseUrl}/pro/profile/cover`, { publicId });
  }

  removeCover(): Observable<OwnProfessional> {
    return this.http.delete<OwnProfessional>(`${this.baseUrl}/pro/profile/cover`);
  }

  removeAvatar(): Observable<OwnProfessional> {
    return this.http.delete<OwnProfessional>(`${this.baseUrl}/pro/profile/avatar`);
  }

  // ---- Trabajos realizados (Free 0 / PRO 10 / Plus 30, 5 fotos cada uno) ----

  works(): Observable<WorkList> {
    return this.http.get<WorkList>(`${this.baseUrl}/pro/profile/works`);
  }

  /** 409 WORKS_LIMIT_REACHED con el plan completo; 422 INVALID_WORK con `details.field`. */
  createWork(body: WorkInput): Observable<WorkList> {
    return this.http.post<WorkList>(`${this.baseUrl}/pro/profile/works`, body);
  }

  updateWork(id: string, body: Partial<WorkInput>): Observable<WorkList> {
    return this.http.patch<WorkList>(`${this.baseUrl}/pro/profile/works/${id}`, body);
  }

  removeWork(id: string): Observable<WorkList> {
    return this.http.delete<WorkList>(`${this.baseUrl}/pro/profile/works/${id}`);
  }

  /** Vuelve a mostrar un trabajo archivado por plan (en Free reemplaza al que se muestra). */
  restoreWork(id: string): Observable<WorkList> {
    return this.http.patch<WorkList>(`${this.baseUrl}/pro/profile/works/${id}/restore`, {});
  }

  /** Firma para subir directo a Cloudinary (409 WORK_PHOTOS_LIMIT_REACHED si el trabajo ya tiene 5). */
  workPhotoTicket(workId: string): Observable<UploadTicket> {
    return this.http.post<UploadTicket>(`${this.baseUrl}/pro/profile/work-photos/sign`, { workId });
  }

  /** Confirma la foto subida (el backend valida formato, peso y el máximo del trabajo). */
  addWorkPhoto(workId: string, publicId: string, caption: string | null): Observable<WorkList> {
    return this.http.post<WorkList>(`${this.baseUrl}/pro/profile/work-photos`, { workId, publicId, caption });
  }

  updateWorkPhoto(id: string, caption: string | null): Observable<WorkList> {
    return this.http.patch<WorkList>(`${this.baseUrl}/pro/profile/work-photos/${id}`, { caption });
  }

  moveWorkPhoto(id: string, workId: string): Observable<WorkList> {
    return this.http.patch<WorkList>(`${this.baseUrl}/pro/profile/work-photos/${id}/move`, { workId });
  }

  removeWorkPhoto(id: string): Observable<WorkList> {
    return this.http.delete<WorkList>(`${this.baseUrl}/pro/profile/work-photos/${id}`);
  }

  /** Todas las fotos del trabajo en el orden nuevo (la primera es la portada). */
  reorderWorkPhotos(workId: string, ids: string[]): Observable<WorkList> {
    return this.http.put<WorkList>(`${this.baseUrl}/pro/profile/work-photos/order`, { workId, ids });
  }

  restoreWorkPhoto(id: string): Observable<WorkList> {
    return this.http.patch<WorkList>(`${this.baseUrl}/pro/profile/work-photos/${id}/restore`, {});
  }

  submitLicense(body: LicenseSubmission): Observable<OwnProfessional> {
    return this.http.post<OwnProfessional>(`${this.baseUrl}/pro/verifications`, body);
  }
}
