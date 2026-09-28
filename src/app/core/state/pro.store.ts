import { Injectable, PLATFORM_ID, computed, effect, inject, signal, untracked } from '@angular/core';
import { HttpEventType } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import { firstValueFrom, lastValueFrom, tap } from 'rxjs';
import { classifyError } from '../api/api-error';
import { ProProfileApiService } from '../api/pro-profile-api.service';
import { Entitlements, OwnPlan } from '../models/pro-analytics';
import { AvatarSubject, avatarOf } from '../models/avatar';
import {
  DOCUMENT_MIME_TYPES,
  EligibleIntroOffer,
  MAX_DOCUMENT_BYTES,
  OfferSurface,
  OwnProfessional,
  ProfessionalStatus,
  UpdateProfessionalProfile,
} from '../models/pro-profile';
import { ToastService } from '../services/toast.service';
import { AuthStore } from './auth.store';
import { HomeProfessionalsStore } from './home-professionals.store';
import { ProfessionalsStore } from './professionals.store';

export const AVAILABILITY_MESSAGES = {
  updated: 'Disponibilidad actualizada',
  failed: 'No pudimos actualizar tu disponibilidad. Intentá de nuevo.',
} as const;

/** Secciones de /pro/perfil que se guardan por separado. */
export type ProfileSection = 'presentation' | 'services' | 'coverage' | 'status';

export const PROFILE_MESSAGES = {
  saved: 'Cambios guardados',
  failed: 'No pudimos guardar los cambios. Revisá tu conexión e intentá de nuevo.',
  invalid: 'Revisá los datos: algún servicio o barrio puede haber cambiado.',
  paused: 'Pausaste tu perfil. No vas a aparecer en búsquedas nuevas.',
  resumed: 'Tu perfil vuelve a aparecer en búsquedas.',
} as const;

export const LICENSE_MESSAGES = {
  sent: 'Enviamos tu matrícula a revisión',
  type: 'El archivo tiene que ser PDF, JPG, PNG o WebP.',
  size: 'El archivo pesa más de 10 MB.',
  reference: 'Ingresá el número o la referencia de la matrícula.',
  unavailable: 'La carga de documentos todavía no está disponible. Podés enviar solo el número.',
  active: 'Esta matrícula ya está en revisión o verificada.',
  invalidDocument: 'No pudimos leer ese archivo. Tiene que ser PDF, JPG, PNG o WebP de hasta 10 MB.',
  uploadFailed: 'No pudimos subir el archivo. Revisá tu conexión e intentá de nuevo.',
  failed: 'No pudimos enviar la matrícula. Intentá de nuevo.',
  rateLimited: 'Hiciste muchos intentos seguidos. Esperá un minuto e intentá de nuevo.',
} as const;

export const AVATAR_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
export const AVATAR_MESSAGES = {
  type: 'La foto tiene que ser JPG, PNG o WebP.',
  size: 'La foto pesa más de 5 MB.',
  invalid: 'No pudimos usar esa foto. Tiene que ser JPG, PNG o WebP de hasta 5 MB.',
  unavailable: 'La carga de fotos todavía no está disponible.',
  uploadFailed: 'No pudimos subir la foto. Revisá tu conexión e intentá de nuevo.',
  rejected: 'El almacenamiento de fotos rechazó la subida. Probá de nuevo más tarde.',
  removeFailed: 'No pudimos eliminar la foto. Intentá de nuevo.',
  rateLimited: 'Hiciste muchos intentos seguidos. Esperá un minuto e intentá de nuevo.',
  saved: 'Actualizamos tu foto',
  removed: 'Eliminamos tu foto',
} as const;

/** Validación local de la foto (el backend vuelve a validar formato y peso REALES). */
export function avatarProblem(file: File): string | null {
  if (!AVATAR_MIME_TYPES.includes(file.type)) return AVATAR_MESSAGES.type;
  if (file.size > MAX_AVATAR_BYTES) return AVATAR_MESSAGES.size;
  return null;
}

export function avatarErrorMessage(error: unknown): string {
  const e = classifyError(error);
  if (e.code === 'UPLOADS_NOT_CONFIGURED') return AVATAR_MESSAGES.unavailable;
  if (e.code === 'INVALID_IMAGE') return AVATAR_MESSAGES.invalid;
  if (e.kind === 'rate-limited') return AVATAR_MESSAGES.rateLimited;
  return AVATAR_MESSAGES.uploadFailed;
}

export interface AvatarUpload {
  phase: 'signing' | 'uploading' | 'saving' | 'removing';
  progress: number;
}

export const PRO_INTEREST_FAILED = 'No pudimos registrar tu pedido. Revisá tu conexión e intentá de nuevo.';

export interface LicenseUpload {
  serviceId: string;
  phase: 'signing' | 'uploading' | 'saving';
  /** 0–100 mientras sube el archivo. */
  progress: number;
}

/** Validación local (el backend vuelve a validar el formato y el peso REALES). */
export function documentProblem(file: File): string | null {
  if (!DOCUMENT_MIME_TYPES.includes(file.type)) return LICENSE_MESSAGES.type;
  if (file.size > MAX_DOCUMENT_BYTES) return LICENSE_MESSAGES.size;
  return null;
}

export function licenseErrorMessage(error: unknown): string {
  const e = classifyError(error);
  if (e.code === 'UPLOADS_NOT_CONFIGURED') return LICENSE_MESSAGES.unavailable;
  if (e.code === 'VERIFICATION_ALREADY_ACTIVE') return LICENSE_MESSAGES.active;
  if (e.code === 'INVALID_DOCUMENT') return LICENSE_MESSAGES.invalidDocument;
  if (e.kind === 'rate-limited') return LICENSE_MESSAGES.rateLimited;
  if (e.kind === 'not-found') return LICENSE_MESSAGES.uploadFailed;
  return LICENSE_MESSAGES.failed;
}

/**
 * Estado del área profesional.
 * REAL: identidad, perfil propio (GET /pro/me), edición por secciones,
 * pausa, "Disponible hoy" y matrículas. Una sola fuente: `ownProfile`
 * (el switch del sidebar y la sección de /pro/perfil leen lo mismo).
 * Solicitudes y presupuestos viven en ProRequestsStore.
 * Plan y entitlements: vienen de /pro/me (efectivos: un PRO vencido ya es FREE).
 */
@Injectable({ providedIn: 'root' })
export class ProStore {
  private readonly toast = inject(ToastService);
  private readonly auth = inject(AuthStore);
  private readonly api = inject(ProProfileApiService);
  private readonly professionals = inject(ProfessionalsStore);
  private readonly homeProfessionals = inject(HomeProfessionalsStore);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /** Perfil público REAL del usuario, solo si ya tiene ProfessionalProfile. */
  readonly publicProfileId = computed(() => this.auth.user()?.professionalProfileId ?? null);

  /** Identidad del área pro: SOLO el usuario autenticado. Sin sesión no hay identidad (nunca una de ejemplo). */
  readonly me = computed<AvatarSubject | null>(() => {
    const u = this.auth.user();
    return u
      ? avatarOf({ id: u.id, displayName: this.auth.displayName(), avatarUrl: u.avatarUrl, firstName: u.firstName, lastName: u.lastName })
      : null;
  });
  readonly firstName = computed(() => this.auth.user()?.firstName ?? null);

  // ---- Perfil propio (real) ----------------------------------------------
  readonly ownProfile = signal<OwnProfessional | null>(null);
  readonly ownProfileError = signal(false);
  /** null = todavía no se sabe (sin perfil, cargando o error): la UI no muestra el switch. */
  readonly available = computed(() => this.ownProfile()?.availableToday ?? null);
  readonly savingAvailability = signal(false);
  readonly savingSection = signal<ProfileSection | null>(null);
  readonly sectionError = signal<{ section: ProfileSection; message: string } | null>(null);
  readonly licenseUpload = signal<LicenseUpload | null>(null);
  readonly licenseError = signal<{ serviceId: string; message: string } | null>(null);
  private loadedFor: string | null = null;

  // ---- Plan (real: efectivo según el backend) ------------------------------
  /** null = todavía no se sabe (sin perfil, cargando o error). */
  readonly plan = computed<OwnPlan | null>(() => this.ownProfile()?.plan ?? null);
  /** Qué habilita el plan. La UI pregunta por entitlements, nunca por el tier. */
  readonly entitlements = computed<Entitlements | null>(() => this.plan()?.entitlements ?? null);
  /**
   * Badge "PRO": suscripción vigente (el plan efectivo ya descuenta el
   * vencimiento). Único lugar que mira el tier; el resto de la UI pregunta
   * por entitlements. null = todavía no se sabe.
   */
  readonly hasPro = computed<boolean | null>(() => {
    const plan = this.plan();
    return plan ? plan.tier === 'PRO' : null;
  });
  /** Puede ocupar espacios destacados ahora (plan + reglas públicas). */
  readonly featuredEligible = computed(() => !!this.ownProfile()?.featured?.eligible);
  readonly requestingPro = signal(false);

  // ---- Oferta de bienvenida (la decide el backend) ---------------------------
  /**
   * Oferta de PRO que HOY puede usar (null = ninguna: PRO, ya la usó, no llegó
   * al umbral o está apagada). Nunca se deriva en el frontend.
   */
  readonly introOffer = computed<EligibleIntroOffer | null>(() => {
    const o = this.ownProfile()?.proIntroOffer;
    return o?.eligible ? o : null;
  });
  /** Eventos ya enviados en esta sesión (el backend además deduplica por día). */
  private readonly trackedOffers = new Set<string>();

  constructor() {
    effect(() => {
      const profileId = this.publicProfileId();
      untracked(() => {
        if (profileId === this.loadedFor) return;
        this.ownProfile.set(null);
        this.ownProfileError.set(false);
        this.sectionError.set(null);
        this.licenseError.set(null);
        this.loadedFor = profileId;
        if (profileId && this.isBrowser) this.loadMe(profileId);
      });
    });
  }

  private loadMe(profileId: string): void {
    this.api.getMe().subscribe({
      next: (me) => {
        if (this.loadedFor === profileId) {
          this.ownProfile.set(me);
          this.ownProfileError.set(false);
        }
      },
      error: () => {
        if (this.loadedFor === profileId) this.ownProfileError.set(true);
      },
    });
  }

  /** Relee /pro/me (p. ej. el cupo del mes). Antes de la carga inicial no hace nada: la hace el effect. */
  refreshProfile(): void {
    const id = this.publicProfileId();
    if (id && this.isBrowser && id === this.loadedFor) {
      this.ownProfileError.set(false);
      this.loadMe(id);
    }
  }

  async acknowledgeFirstSuccess(): Promise<boolean> {
    try {
      this.applyOwn(await firstValueFrom(this.api.acknowledgeFirstSuccess()));
      return true;
    } catch {
      return false;
    }
  }

  /** Respuesta nueva del backend: una sola copia, y lo público se vuelve a pedir (sin F5). */
  private applyOwn(me: OwnProfessional): void {
    this.ownProfile.set(me);
    this.professionals.invalidate();
    this.homeProfessionals.invalidate();
  }

  /**
   * Embudo de la oferta: "mostrada" y "click" por superficie. Una vez por
   * sesión y superficie; si falla no se reintenta ni se avisa (es medición).
   */
  trackOffer(type: 'SHOWN' | 'CLICKED', surface: OfferSurface, offer: EligibleIntroOffer | null = this.introOffer()): void {
    if (!offer || !this.isBrowser) return;
    const key = `${type}|${surface}|${offer.offerCode}`;
    if (this.trackedOffers.has(key)) return;
    this.trackedOffers.add(key);
    this.api.offerEvent(type, surface, offer.offerCode).subscribe({ error: () => undefined });
  }

  /** "Quiero PRO" (sin billing): registra el pedido; el plan no cambia. Con oferta elegible, la reserva. */
  async requestPro(): Promise<boolean> {
    if (this.requestingPro()) return false;
    this.requestingPro.set(true);
    try {
      this.ownProfile.set(await firstValueFrom(this.api.requestPro(this.introOffer()?.offerCode)));
      return true;
    } catch {
      this.toast.show(PRO_INTEREST_FAILED, 3200, 'info');
      return false;
    } finally {
      this.requestingPro.set(false);
    }
  }

  // ---- Edición por secciones ----------------------------------------------

  /** Guarda una sección. Sin reintentos automáticos; evita doble envío. */
  async updateProfile(section: ProfileSection, patch: UpdateProfessionalProfile): Promise<boolean> {
    if (this.savingSection()) return false;
    this.savingSection.set(section);
    this.sectionError.set(null);
    try {
      this.applyOwn(await firstValueFrom(this.api.updateProfile(patch)));
      this.toast.show(PROFILE_MESSAGES.saved, 2000);
      return true;
    } catch (error) {
      const e = classifyError(error);
      this.sectionError.set({ section, message: e.kind === 'validation' ? PROFILE_MESSAGES.invalid : PROFILE_MESSAGES.failed });
      return false;
    } finally {
      this.savingSection.set(null);
    }
  }

  async setStatus(status: ProfessionalStatus): Promise<boolean> {
    if (this.savingSection()) return false;
    this.savingSection.set('status');
    this.sectionError.set(null);
    try {
      this.applyOwn(await firstValueFrom(this.api.setStatus(status)));
      this.toast.show(status === 'PAUSED' ? PROFILE_MESSAGES.paused : PROFILE_MESSAGES.resumed, 2600);
      return true;
    } catch {
      this.sectionError.set({ section: 'status', message: PROFILE_MESSAGES.failed });
      return false;
    } finally {
      this.savingSection.set(null);
    }
  }

  // ---- "Disponible hoy" -----------------------------------------------------

  /** Persiste el cambio; si falla, queda el valor real anterior. Sin reintentos automáticos. */
  async setAvailability(next: boolean): Promise<boolean> {
    const current = this.ownProfile();
    if (!current || this.savingAvailability()) return false;
    this.savingAvailability.set(true);
    // Optimista y reversible: el switch responde al toque.
    this.ownProfile.set({ ...current, availableToday: next });
    try {
      this.applyOwn(await firstValueFrom(this.api.setAvailability(next)));
      this.toast.show(AVAILABILITY_MESSAGES.updated, 2000);
      return true;
    } catch {
      this.ownProfile.set(current);
      this.toast.show(AVAILABILITY_MESSAGES.failed, 3200, 'info');
      return false;
    } finally {
      this.savingAvailability.set(false);
    }
  }

  toggleAvailability(): void {
    const current = this.available();
    if (current !== null) void this.setAvailability(!current);
  }

  // ---- Foto de perfil -----------------------------------------------------------

  readonly avatarUpload = signal<AvatarUpload | null>(null);
  readonly avatarError = signal<string | null>(null);

  /**
   * Firma → subida directa a Cloudinary (con progreso real) → confirmación.
   * El archivo nunca pasa por nuestra API ni por Postgres. Sin doble envío.
   */
  async uploadAvatar(file: File): Promise<boolean> {
    if (this.avatarUpload()) return false;
    this.avatarError.set(null);
    const problem = avatarProblem(file);
    if (problem) {
      this.avatarError.set(problem);
      return false;
    }
    this.avatarUpload.set({ phase: 'signing', progress: 0 });
    try {
      const ticket = await firstValueFrom(this.api.avatarTicket());
      this.avatarUpload.set({ phase: 'uploading', progress: 0 });
      try {
        await lastValueFrom(
          this.api.uploadFile(ticket, file).pipe(
            tap((event) => {
              if (event.type === HttpEventType.UploadProgress && event.total) {
                this.avatarUpload.set({ phase: 'uploading', progress: Math.round((event.loaded / event.total) * 100) });
              }
            }),
          ),
        );
      } catch (error) {
        // Sin respuesta = red; con respuesta (400/401) = el proveedor rechazó la firma o el archivo.
        const status = (error as { status?: number })?.status ?? 0;
        this.avatarError.set(status ? AVATAR_MESSAGES.rejected : AVATAR_MESSAGES.uploadFailed);
        return false;
      }
      this.avatarUpload.set({ phase: 'saving', progress: 100 });
      this.applyAvatar(await firstValueFrom(this.api.setAvatar(ticket.publicId)));
      this.toast.show(AVATAR_MESSAGES.saved, 2200);
      return true;
    } catch (error) {
      this.avatarError.set(avatarErrorMessage(error));
      return false;
    } finally {
      this.avatarUpload.set(null);
    }
  }

  async removeAvatar(): Promise<boolean> {
    if (this.avatarUpload()) return false;
    this.avatarError.set(null);
    this.avatarUpload.set({ phase: 'removing', progress: 0 });
    try {
      this.applyAvatar(await firstValueFrom(this.api.removeAvatar()));
      this.toast.show(AVATAR_MESSAGES.removed, 2200);
      return true;
    } catch {
      this.avatarError.set(AVATAR_MESSAGES.removeFailed);
      return false;
    } finally {
      this.avatarUpload.set(null);
    }
  }

  private applyAvatar(me: OwnProfessional): void {
    this.applyOwn(me);
    this.auth.setAvatarUrl(me.avatarUrl);
  }

  // ---- Matrícula --------------------------------------------------------------

  /**
   * Número obligatorio; documento opcional. Con documento: firma → subida
   * directa al almacenamiento privado (con progreso) → confirmación en el
   * backend. El archivo nunca pasa por nuestra API.
   */
  async submitLicense(serviceId: string, input: { file: File | null; reference: string; expiresAt?: string | null }): Promise<boolean> {
    if (this.licenseUpload()) return false;
    const fail = (message: string) => {
      this.licenseError.set({ serviceId, message });
      return false;
    };
    this.licenseError.set(null);
    const reference = input.reference.trim();
    if (reference.length < 2) return fail(LICENSE_MESSAGES.reference);
    // El documento es opcional: lo que se verifica es el número contra el registro oficial.
    const file = input.file;
    const problem = file ? documentProblem(file) : null;
    if (problem) return fail(problem);

    this.licenseUpload.set({ serviceId, phase: file ? 'signing' : 'saving', progress: file ? 0 : 100 });
    try {
      let documentPublicId: string | undefined;
      if (file) {
        const ticket = await firstValueFrom(this.api.uploadTicket(serviceId));
        this.licenseUpload.set({ serviceId, phase: 'uploading', progress: 0 });
        try {
          await lastValueFrom(
            this.api.uploadFile(ticket, file).pipe(
              tap((event) => {
                if (event.type === HttpEventType.UploadProgress && event.total) {
                  this.licenseUpload.set({ serviceId, phase: 'uploading', progress: Math.round((event.loaded / event.total) * 100) });
                }
              }),
            ),
          );
        } catch {
          return fail(LICENSE_MESSAGES.uploadFailed);
        }
        documentPublicId = ticket.publicId;
        this.licenseUpload.set({ serviceId, phase: 'saving', progress: 100 });
      }
      const me = await firstValueFrom(
        this.api.submitLicense({
          type: 'LICENSE',
          serviceId,
          reference,
          ...(documentPublicId ? { documentPublicId } : {}),
          ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
        }),
      );
      this.applyOwn(me);
      this.toast.show(LICENSE_MESSAGES.sent, 2600);
      return true;
    } catch (error) {
      return fail(licenseErrorMessage(error));
    } finally {
      this.licenseUpload.set(null);
    }
  }
}
