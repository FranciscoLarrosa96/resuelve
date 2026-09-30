import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse, HttpEventType } from '@angular/common/http';
import { firstValueFrom, lastValueFrom, tap } from 'rxjs';
import { classifyError } from '../api/api-error';
import { ProProfileApiService, WorkPhotoList } from '../api/pro-profile-api.service';
import { WorkPhoto } from '../models/professional';
import { ToastService } from '../services/toast.service';
import { ProfessionalsStore } from './professionals.store';

/** Mismos límites que el backend (`work-photo-rules.ts`); el backend vuelve a validar todo. */
export const MAX_WORK_PHOTOS = 20;
export const MAX_WORK_PHOTO_BYTES = 8 * 1024 * 1024;
export const MAX_CAPTION_LENGTH = 80;
export const WORK_PHOTO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export const WORK_PHOTO_MESSAGES = {
  type: 'La foto tiene que ser JPG, PNG o WebP.',
  size: 'La foto pesa más de 8 MB.',
  invalid: 'No pudimos usar esa foto. Tiene que ser JPG, PNG o WebP de hasta 8 MB.',
  limit: 'Ya alcanzaste el máximo de fotos permitidas en tu portfolio.',
  unavailable: 'La carga de fotos todavía no está disponible.',
  uploadFailed: 'No pudimos subir la foto. Revisá tu conexión e intentá de nuevo.',
  rejected: 'El almacenamiento de fotos rechazó la subida. Probá de nuevo más tarde.',
  removeFailed: 'No pudimos borrar la foto. Probá de nuevo en unos minutos.',
  saveFailed: 'No pudimos guardar el cambio. Intentá de nuevo.',
  loadFailed: 'No pudimos cargar tus fotos.',
  rateLimited: 'Hiciste muchos intentos seguidos. Esperá un minuto e intentá de nuevo.',
  added: 'Agregamos la foto a tu perfil',
  removed: 'Borramos la foto',
} as const;

/** Validación local (formato y peso del archivo elegido). */
export function workPhotoProblem(file: File): string | null {
  if (!WORK_PHOTO_MIME_TYPES.includes(file.type)) return WORK_PHOTO_MESSAGES.type;
  if (file.size > MAX_WORK_PHOTO_BYTES) return WORK_PHOTO_MESSAGES.size;
  return null;
}

function messageFor(error: unknown, fallback: string): string {
  const e = classifyError(error);
  if (e.code === 'WORK_PHOTOS_LIMIT_REACHED') return WORK_PHOTO_MESSAGES.limit;
  if (e.code === 'UPLOADS_NOT_CONFIGURED') return WORK_PHOTO_MESSAGES.unavailable;
  if (e.code === 'INVALID_IMAGE') return WORK_PHOTO_MESSAGES.invalid;
  if (e.code === 'INVALID_CAPTION') {
    const message = (error as HttpErrorResponse).error?.message;
    return typeof message === 'string' ? message : WORK_PHOTO_MESSAGES.saveFailed;
  }
  if (e.kind === 'rate-limited') return WORK_PHOTO_MESSAGES.rateLimited;
  return fallback;
}

export interface WorkPhotoUpload {
  phase: 'signing' | 'uploading' | 'saving';
  progress: number;
}

/**
 * "Trabajos realizados" del profesional logueado (/pro/perfil). Única fuente
 * de sus fotos: la lista siempre es la que devuelve el backend después de
 * cada acción (nunca un estado optimista que pueda mentir).
 */
@Injectable({ providedIn: 'root' })
export class WorkPhotosStore {
  private readonly api = inject(ProProfileApiService);
  private readonly toast = inject(ToastService);
  private readonly professionals = inject(ProfessionalsStore);

  readonly items = signal<WorkPhoto[]>([]);
  readonly max = signal(MAX_WORK_PHOTOS);
  readonly maxStored = signal(MAX_WORK_PHOTOS);
  readonly activeCount = signal(0);
  readonly loaded = signal(false);
  readonly loading = signal(false);
  readonly loadError = signal(false);
  readonly upload = signal<WorkPhotoUpload | null>(null);
  /** Foto sobre la que hay una acción en curso (borrar, mover, descripción). */
  readonly busyId = signal<string | null>(null);
  readonly error = signal<string | null>(null);

  readonly count = computed(() => this.items().filter((photo) => !photo.archivedByPlan).length);
  readonly storedCount = computed(() => this.items().length);
  readonly archivedCount = computed(() => this.storedCount() - this.count());
  readonly storedFull = computed(() => this.storedCount() >= this.maxStored());
  readonly full = computed(() => this.count() >= this.max() || this.storedFull());
  readonly busy = computed(() => !!this.upload() || !!this.busyId());

  async load(): Promise<void> {
    if (this.loading()) return;
    this.loading.set(true);
    this.loadError.set(false);
    try {
      this.apply(await firstValueFrom(this.api.workPhotos()));
      this.loaded.set(true);
    } catch {
      this.loadError.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  /** Firma → subida directa a Cloudinary (con progreso) → confirmación. Sin doble envío. */
  async add(file: File, caption: string | null = null): Promise<boolean> {
    if (this.busy()) return false;
    this.error.set(null);
    if (this.full()) {
      this.error.set(WORK_PHOTO_MESSAGES.limit);
      return false;
    }
    const problem = workPhotoProblem(file);
    if (problem) {
      this.error.set(problem);
      return false;
    }
    this.upload.set({ phase: 'signing', progress: 0 });
    try {
      const ticket = await firstValueFrom(this.api.workPhotoTicket());
      this.upload.set({ phase: 'uploading', progress: 0 });
      try {
        await lastValueFrom(
          this.api.uploadFile(ticket, file).pipe(
            tap((event) => {
              if (event.type === HttpEventType.UploadProgress && event.total) {
                this.upload.set({ phase: 'uploading', progress: Math.round((event.loaded / event.total) * 100) });
              }
            }),
          ),
        );
      } catch (error) {
        const status = (error as { status?: number })?.status ?? 0;
        this.error.set(status ? WORK_PHOTO_MESSAGES.rejected : WORK_PHOTO_MESSAGES.uploadFailed);
        return false;
      }
      this.upload.set({ phase: 'saving', progress: 100 });
      this.apply(await firstValueFrom(this.api.addWorkPhoto(ticket.publicId, caption)));
      this.toast.show(WORK_PHOTO_MESSAGES.added, 2200);
      return true;
    } catch (error) {
      this.error.set(messageFor(error, WORK_PHOTO_MESSAGES.uploadFailed));
      // Con el máximo alcanzado en otra pestaña, la lista real se relee.
      if (classifyError(error).code === 'WORK_PHOTOS_LIMIT_REACHED') void this.load();
      return false;
    } finally {
      this.upload.set(null);
    }
  }

  remove(id: string): Promise<boolean> {
    return this.run(id, () => this.api.removeWorkPhoto(id), WORK_PHOTO_MESSAGES.removeFailed, WORK_PHOTO_MESSAGES.removed);
  }

  saveCaption(id: string, caption: string): Promise<boolean> {
    const clean = caption.trim();
    return this.run(id, () => this.api.updateWorkPhoto(id, clean || null), WORK_PHOTO_MESSAGES.saveFailed);
  }

  /** Mueve una foto un lugar (−1 antes, +1 después). */
  move(id: string, delta: -1 | 1): Promise<boolean> {
    const ids = this.items().map((p) => p.id);
    const from = ids.indexOf(id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= ids.length) return Promise.resolve(false);
    [ids[from], ids[to]] = [ids[to], ids[from]];
    return this.run(id, () => this.api.reorderWorkPhotos(ids), WORK_PHOTO_MESSAGES.saveFailed);
  }

  restore(id: string): Promise<boolean> {
    return this.run(id, () => this.api.restoreWorkPhoto(id), WORK_PHOTO_MESSAGES.saveFailed);
  }

  setFeatured(id: string, featured: boolean): Promise<boolean> {
    return this.run(id, () => this.api.setWorkPhotoFeatured(id, featured), WORK_PHOTO_MESSAGES.saveFailed);
  }

  private async run(
    id: string,
    call: () => ReturnType<ProProfileApiService['workPhotos']>,
    fallback: string,
    success?: string,
  ): Promise<boolean> {
    if (this.busy()) return false;
    this.error.set(null);
    this.busyId.set(id);
    try {
      this.apply(await firstValueFrom(call()));
      if (success) this.toast.show(success, 2200);
      return true;
    } catch (error) {
      this.error.set(messageFor(error, fallback));
      return false;
    } finally {
      this.busyId.set(null);
    }
  }

  private apply(list: WorkPhotoList): void {
    this.items.set([...list.items].sort((a, b) => a.sortOrder - b.sortOrder));
    this.max.set(list.max);
    this.maxStored.set(list.maxStored);
    this.activeCount.set(list.activeCount);
    // El perfil público cacheado ya no coincide.
    this.professionals.invalidate();
  }
}
