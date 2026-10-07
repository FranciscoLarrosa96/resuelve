import { HttpClient, HttpEvent } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  CreateProfessionalProfile,
  LicenseSubmission,
  OfferSurface,
  OwnProfessional,
  ProfessionalStatus,
  UpdateProfessionalProfile,
  UploadTicket,
} from '../models/pro-profile';
import { WorkPhoto } from '../models/professional';
import { API_URL } from './api.config';

export type { CreateProfessionalProfile, OwnProfessional } from '../models/pro-profile';

/** Respuesta de /pro/profile/work-photos: la lista completa, en orden. */
export interface WorkPhotoList {
  items: WorkPhoto[];
  /** Límite de fotos activas entregado por el backend según entitlement. */
  max: number;
  activeCount: number;
  maxStored: number;
  maxBytes: number;
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

  acknowledgeFirstSuccess(): Observable<OwnProfessional> {
    return this.http.post<OwnProfessional>(`${this.baseUrl}/pro/first-success/acknowledge`, {});
  }

  updateProfile(patch: UpdateProfessionalProfile): Observable<OwnProfessional> {
    return this.http.patch<OwnProfessional>(`${this.baseUrl}/pro/profile`, patch);
  }

  /** Pausar / reactivar el perfil (no toca "Disponible hoy"). */
  setStatus(status: ProfessionalStatus): Observable<OwnProfessional> {
    return this.http.patch<OwnProfessional>(`${this.baseUrl}/pro/status`, { status });
  }

  /** PATCH /pro/availability: "Disponible hoy" persiste y vence a medianoche (hora de Argentina). */
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

  removeAvatar(): Observable<OwnProfessional> {
    return this.http.delete<OwnProfessional>(`${this.baseUrl}/pro/profile/avatar`);
  }

  // ---- Trabajos realizados (fotos públicas, máximo 5) ----------------------

  workPhotos(): Observable<WorkPhotoList> {
    return this.http.get<WorkPhotoList>(`${this.baseUrl}/pro/profile/work-photos`);
  }

  /** Firma para subir directo a Cloudinary (409 WORK_PHOTOS_LIMIT_REACHED con 5). */
  workPhotoTicket(): Observable<UploadTicket> {
    return this.http.post<UploadTicket>(`${this.baseUrl}/pro/profile/work-photos/sign`, {});
  }

  /** Confirma la foto subida (el backend valida formato, peso y el máximo). */
  addWorkPhoto(publicId: string, caption: string | null): Observable<WorkPhotoList> {
    return this.http.post<WorkPhotoList>(`${this.baseUrl}/pro/profile/work-photos`, { publicId, caption });
  }

  updateWorkPhoto(id: string, caption: string | null): Observable<WorkPhotoList> {
    return this.http.patch<WorkPhotoList>(`${this.baseUrl}/pro/profile/work-photos/${id}`, { caption });
  }

  removeWorkPhoto(id: string): Observable<WorkPhotoList> {
    return this.http.delete<WorkPhotoList>(`${this.baseUrl}/pro/profile/work-photos/${id}`);
  }

  reorderWorkPhotos(ids: string[]): Observable<WorkPhotoList> {
    return this.http.put<WorkPhotoList>(`${this.baseUrl}/pro/profile/work-photos/order`, { ids });
  }

  restoreWorkPhoto(id: string): Observable<WorkPhotoList> {
    return this.http.patch<WorkPhotoList>(`${this.baseUrl}/pro/profile/work-photos/${id}/restore`, {});
  }

  setWorkPhotoFeatured(id: string, featured: boolean): Observable<WorkPhotoList> {
    return this.http.patch<WorkPhotoList>(`${this.baseUrl}/pro/profile/work-photos/${id}/featured`, { featured });
  }

  submitLicense(body: LicenseSubmission): Observable<OwnProfessional> {
    return this.http.post<OwnProfessional>(`${this.baseUrl}/pro/verifications`, body);
  }
}
