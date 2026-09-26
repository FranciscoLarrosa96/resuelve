import { Injectable, PLATFORM_ID, computed, effect, inject, signal, untracked } from '@angular/core';
import { HttpEventType } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import { firstValueFrom, lastValueFrom, tap } from 'rxjs';
import { classifyError } from '../api/api-error';
import { ProProfileApiService } from '../api/pro-profile-api.service';
import { ProPlan } from '../models/pro';
import { AvatarSubject, avatarOf } from '../models/avatar';
import {
  DOCUMENT_MIME_TYPES,
  MAX_DOCUMENT_BYTES,
  OwnProfessional,
  ProfessionalStatus,
  UpdateProfessionalProfile,
} from '../models/pro-profile';
import { ToastService } from '../services/toast.service';
import { AuthStore } from './auth.store';
import { HomeProfessionalsStore } from './home-professionals.store';
import { ProfessionalsStore } from './professionals.store';

const DEMO_PRO_ID = 'demo-pro';
/** Sin sesión, las pantallas demo muestran esta identidad (nunca mezclada con un usuario real). */
const DEMO_NAME = 'Profesional de ejemplo';

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
 * DEMO: agenda, estadísticas y plan (pantallas con aviso).
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

  /** Identidad del área pro: SIEMPRE el usuario autenticado (foto o iniciales reales). */
  readonly me = computed<AvatarSubject>(() => {
    const u = this.auth.user();
    if (u) {
      return avatarOf({ id: u.id, displayName: this.auth.displayName(), avatarUrl: u.avatarUrl, firstName: u.firstName, lastName: u.lastName });
    }
    return avatarOf({ id: DEMO_PRO_ID, displayName: DEMO_NAME, avatarUrl: null });
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

  // ---- Plan (real, sin mostrar límites hasta que haya planes comerciales) ---
  readonly plan = computed<ProPlan | null>(() => {
    const tier = this.ownProfile()?.planTier;
    return tier ? (tier.toLowerCase() as ProPlan) : null;
  });
  readonly isFree = computed(() => this.plan() === 'free');

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

  refreshProfile(): void {
    const id = this.publicProfileId();
    if (id) {
      this.ownProfileError.set(false);
      this.loadMe(id);
    }
  }

  /** Respuesta nueva del backend: una sola copia, y lo público se vuelve a pedir (sin F5). */
  private applyOwn(me: OwnProfessional): void {
    this.ownProfile.set(me);
    this.professionals.invalidate();
    this.homeProfessionals.invalidate();
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
            this.api.uploadDocument(ticket, file).pipe(
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
