import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse, HttpEventType } from '@angular/common/http';
import { Observable, firstValueFrom, lastValueFrom, tap } from 'rxjs';
import { classifyError } from '../api/api-error';
import { ProProfileApiService, WorkInput, WorkList } from '../api/pro-profile-api.service';
import { Work } from '../models/professional';
import { ToastService } from '../services/toast.service';
import { ProfessionalsStore } from './professionals.store';
import { canPrepareImages, prepareImageForUpload, storageRejection } from '../utils/prepare-image';

/**
 * Mismos límites que el backend (`work-photo-rules.ts`, que es quien los
 * aplica y vuelve a validar todo): Free 0 trabajos, PRO 30, 5 fotos cada uno.
 */
export const FREE_WORK_LIMIT = 0;
export const PRO_WORK_LIMIT = 30;
export const PRO_PLUS_WORK_LIMIT = 30;
export const PHOTOS_PER_WORK = 5;
export const MAX_WORK_PHOTO_BYTES = 8 * 1024 * 1024;
export const MAX_CAPTION_LENGTH = 80;
export const MAX_WORK_TITLE_LENGTH = 60;
export const MAX_WORK_DESCRIPTION_LENGTH = 160;
export const MIN_WORK_YEAR = 1980;
export const WORK_PHOTO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export const WORK_PHOTO_MESSAGES = {
  type: 'La foto tiene que ser JPG, PNG o WebP.',
  size: 'La foto pesa más de 8 MB.',
  invalid: 'No pudimos usar esa foto. Tiene que ser JPG, PNG o WebP de hasta 8 MB.',
  limit: `Cada trabajo puede tener hasta ${PHOTOS_PER_WORK} fotos.`,
  worksLimit: 'Ya tenés el máximo de trabajos de tu plan.',
  unavailable: 'La carga de fotos todavía no está disponible.',
  uploadFailed: 'No pudimos subir la foto. Revisá tu conexión e intentá de nuevo.',
  rejected: 'El almacenamiento de fotos rechazó la subida. Probá de nuevo más tarde.',
  removeFailed: 'No pudimos borrar la foto. Probá de nuevo en unos minutos.',
  removeWorkFailed: 'No pudimos borrar el trabajo. Probá de nuevo en unos minutos.',
  saveFailed: 'No pudimos guardar el cambio. Intentá de nuevo.',
  loadFailed: 'No pudimos cargar tus trabajos.',
  rateLimited: 'Hiciste muchos intentos seguidos. Esperá un minuto e intentá de nuevo.',
  added: 'Agregamos la foto al trabajo',
  addedMany: (n: number) => `Agregamos ${n} fotos al trabajo`,
  truncated: (room: number) =>
    room === 1 ? 'Solo entraba 1 foto más en este trabajo: subimos la primera.' : `Solo entraban ${room} fotos más en este trabajo: subimos las primeras ${room}.`,
  removed: 'Borramos la foto',
  workCreated: 'Creamos el trabajo. Ya podés sumarle fotos.',
  workRemoved: 'Borramos el trabajo',
} as const;

/** Validación local (formato y peso del archivo elegido). */
export function workPhotoProblem(file: File): string | null {
  if (!WORK_PHOTO_MIME_TYPES.includes(file.type)) return WORK_PHOTO_MESSAGES.type;
  if (file.size > MAX_WORK_PHOTO_BYTES) return WORK_PHOTO_MESSAGES.size;
  return null;
}

/** "2026-03" → "Marzo 2026". */
export function workMonthLabel(month: string): string {
  const [year, mm] = month.split('-').map(Number);
  if (!year || !mm) return '';
  const name = new Intl.DateTimeFormat('es-AR', { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(year, mm - 1, 1)));
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${year}`;
}

/** Mes actual en Argentina ("2026-10"): el último que se puede elegir. */
export function currentWorkMonth(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}`;
}

function messageFor(error: unknown, fallback: string): string {
  const e = classifyError(error);
  const message = (error as HttpErrorResponse)?.error?.message;
  if (e.code === 'WORK_PHOTOS_LIMIT_REACHED') return typeof message === 'string' ? message : WORK_PHOTO_MESSAGES.limit;
  if (e.code === 'WORKS_LIMIT_REACHED') return WORK_PHOTO_MESSAGES.worksLimit;
  if (e.code === 'PRO_REQUIRED') return 'Publicar trabajos con fotos requiere Resuelve PRO.';
  if (e.code === 'UPLOADS_NOT_CONFIGURED') return WORK_PHOTO_MESSAGES.unavailable;
  if (e.code === 'INVALID_IMAGE') return WORK_PHOTO_MESSAGES.invalid;
  if (e.code === 'INVALID_CAPTION' || e.code === 'INVALID_WORK')
    return typeof message === 'string' ? message : WORK_PHOTO_MESSAGES.saveFailed;
  if (e.kind === 'rate-limited') return WORK_PHOTO_MESSAGES.rateLimited;
  return fallback;
}

export interface WorkPhotoUpload {
  workId: string;
  phase: 'signing' | 'uploading' | 'saving';
  progress: number;
}

/**
 * "Trabajos realizados" del profesional logueado (/pro/perfil). Única fuente
 * de sus trabajos y fotos: la lista siempre es la que devuelve el backend
 * después de cada acción (nunca un estado optimista que pueda mentir).
 */
@Injectable({ providedIn: 'root' })
export class WorkPhotosStore {
  private readonly api = inject(ProProfileApiService);
  private readonly toast = inject(ToastService);
  private readonly professionals = inject(ProfessionalsStore);

  readonly works = signal<Work[]>([]);
  readonly maxWorks = signal(FREE_WORK_LIMIT);
  readonly maxStoredWorks = signal(PRO_WORK_LIMIT);
  readonly photosPerWork = signal(PHOTOS_PER_WORK);
  readonly loaded = signal(false);
  readonly loading = signal(false);
  readonly loadError = signal(false);
  readonly upload = signal<WorkPhotoUpload | null>(null);
  /** Subida de varias fotos seguidas: la que se está subiendo (1-based) y el total. */
  readonly batch = signal<{ workId: string; current: number; total: number } | null>(null);
  /** Trabajo o foto sobre el que hay una acción en curso. */
  readonly busyId = signal<string | null>(null);
  /** Último error, con el trabajo al que corresponde (null = general). */
  readonly error = signal<{ workId: string | null; message: string } | null>(null);

  readonly activeWorks = computed(() => this.works().filter((w) => !w.archivedByPlan));
  readonly archivedWorks = computed(() => this.works().filter((w) => w.archivedByPlan));
  /** Fotos guardadas (todas). */
  readonly storedCount = computed(() => this.works().reduce((n, w) => n + w.photos.length, 0));
  /** Fotos que se ven en el perfil público. */
  readonly count = computed(() =>
    this.activeWorks().reduce((n, w) => n + w.photos.filter((p) => !p.archivedByPlan).length, 0),
  );
  /** ¿Se puede crear otro trabajo? */
  readonly canCreate = computed(
    () => this.activeWorks().length < this.maxWorks() && this.works().length < this.maxStoredWorks(),
  );
  readonly isFree = computed(() => this.maxWorks() <= FREE_WORK_LIMIT);
  readonly busy = computed(() => !!this.upload() || !!this.batch() || !!this.busyId());

  /** El trabajo recibe fotos: activo y con menos de 5 (contando las archivadas). */
  hasRoom(work: Work): boolean {
    return this.maxWorks() > 0 && !work.archivedByPlan && work.photos.length < this.photosPerWork();
  }

  async load(): Promise<void> {
    if (this.loading()) return;
    this.loading.set(true);
    this.loadError.set(false);
    try {
      this.apply(await firstValueFrom(this.api.works()));
      this.loaded.set(true);
    } catch {
      this.loadError.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  /** Crea un trabajo. Devuelve su id (o null si no se pudo). */
  async createWork(input: WorkInput): Promise<string | null> {
    if (this.busy()) return null;
    this.error.set(null);
    this.busyId.set('new');
    try {
      const before = new Set(this.works().map((w) => w.id));
      this.apply(await firstValueFrom(this.api.createWork(input)));
      this.toast.show(WORK_PHOTO_MESSAGES.workCreated, 2600);
      return this.works().find((w) => !before.has(w.id))?.id ?? null;
    } catch (error) {
      this.error.set({ workId: 'new', message: messageFor(error, WORK_PHOTO_MESSAGES.saveFailed) });
      if (classifyError(error).code === 'WORKS_LIMIT_REACHED') void this.load();
      return null;
    } finally {
      this.busyId.set(null);
    }
  }

  updateWork(id: string, input: Partial<WorkInput>): Promise<boolean> {
    return this.run(id, id, () => this.api.updateWork(id, input), WORK_PHOTO_MESSAGES.saveFailed);
  }

  removeWork(id: string): Promise<boolean> {
    return this.run(id, id, () => this.api.removeWork(id), WORK_PHOTO_MESSAGES.removeWorkFailed, WORK_PHOTO_MESSAGES.workRemoved);
  }

  restoreWork(id: string): Promise<boolean> {
    return this.run(id, id, () => this.api.restoreWork(id), WORK_PHOTO_MESSAGES.saveFailed);
  }

  /** Firma → subida directa a Cloudinary (con progreso) → confirmación. Sin doble envío. */
  async addPhoto(workId: string, file: File, caption: string | null = null): Promise<boolean> {
    if (this.busy()) return false;
    return this.uploadPhoto(workId, file, caption);
  }

  /**
   * Varias fotos de una vez, de a una y en orden (la primera que entra es la
   * portada si el trabajo estaba vacío). Sube hasta donde haya lugar; si una
   * falla se corta ahí y las anteriores quedan guardadas.
   */
  async addPhotos(workId: string, files: File[]): Promise<number> {
    if (this.busy() || !files.length) return 0;
    if (files.length === 1) return (await this.addPhoto(workId, files[0])) ? 1 : 0;
    this.error.set(null);
    const work = this.works().find((w) => w.id === workId);
    const room = work ? Math.max(0, this.photosPerWork() - work.photos.length) : files.length;
    if (work && !this.hasRoom(work)) {
      this.error.set({ workId, message: WORK_PHOTO_MESSAGES.limit });
      return 0;
    }
    const chosen = files.slice(0, room);
    let added = 0;
    try {
      for (const [i, file] of chosen.entries()) {
        this.batch.set({ workId, current: i + 1, total: chosen.length });
        if (!(await this.uploadPhoto(workId, file, null, true))) break;
        added++;
      }
    } finally {
      this.batch.set(null);
    }
    if (added) this.toast.show(added === 1 ? WORK_PHOTO_MESSAGES.added : WORK_PHOTO_MESSAGES.addedMany(added), 2200);
    if (added === chosen.length && chosen.length < files.length) {
      this.error.set({ workId, message: WORK_PHOTO_MESSAGES.truncated(room) });
    }
    return added;
  }

  private async uploadPhoto(workId: string, file: File, caption: string | null, quiet = false): Promise<boolean> {
    this.error.set(null);
    const work = this.works().find((w) => w.id === workId);
    if (work && !this.hasRoom(work)) {
      this.error.set({ workId, message: WORK_PHOTO_MESSAGES.limit });
      return false;
    }
    // Achicar en el navegador (fotos de celular grandes o convertidas de HEIC) antes de validar y subir.
    this.upload.set({ workId, phase: 'signing', progress: 0 });
    if (canPrepareImages()) file = await prepareImageForUpload(file);
    const problem = workPhotoProblem(file);
    if (problem) {
      this.error.set({ workId, message: problem });
      this.upload.set(null);
      return false;
    }
    try {
      const ticket = await firstValueFrom(this.api.workPhotoTicket(workId));
      this.upload.set({ workId, phase: 'uploading', progress: 0 });
      try {
        await lastValueFrom(
          this.api.uploadFile(ticket, file).pipe(
            tap((event) => {
              if (event.type === HttpEventType.UploadProgress && event.total) {
                this.upload.set({ workId, phase: 'uploading', progress: Math.round((event.loaded / event.total) * 100) });
              }
            }),
          ),
        );
      } catch (error) {
        const status = (error as { status?: number })?.status ?? 0;
        if (status) console.warn('Subida de foto rechazada por el almacenamiento:', status, storageRejection(error));
        this.error.set({ workId, message: status ? WORK_PHOTO_MESSAGES.rejected : WORK_PHOTO_MESSAGES.uploadFailed });
        return false;
      }
      this.upload.set({ workId, phase: 'saving', progress: 100 });
      this.apply(await firstValueFrom(this.api.addWorkPhoto(workId, ticket.publicId, caption)));
      if (!quiet) this.toast.show(WORK_PHOTO_MESSAGES.added, 2200);
      return true;
    } catch (error) {
      this.error.set({ workId, message: messageFor(error, WORK_PHOTO_MESSAGES.uploadFailed) });
      // Con el máximo alcanzado en otra pestaña, la lista real se relee.
      if (classifyError(error).code === 'WORK_PHOTOS_LIMIT_REACHED') void this.load();
      return false;
    } finally {
      this.upload.set(null);
    }
  }

  removePhoto(workId: string, id: string): Promise<boolean> {
    return this.run(workId, id, () => this.api.removeWorkPhoto(id), WORK_PHOTO_MESSAGES.removeFailed, WORK_PHOTO_MESSAGES.removed);
  }

  saveCaption(workId: string, id: string, caption: string): Promise<boolean> {
    const clean = caption.trim();
    return this.run(workId, id, () => this.api.updateWorkPhoto(id, clean || null), WORK_PHOTO_MESSAGES.saveFailed);
  }

  /** Mueve una foto un lugar dentro de su trabajo (−1 antes, +1 después). */
  move(workId: string, id: string, delta: -1 | 1): Promise<boolean> {
    const ids = this.photoIds(workId);
    const from = ids.indexOf(id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= ids.length) return Promise.resolve(false);
    [ids[from], ids[to]] = [ids[to], ids[from]];
    return this.run(workId, id, () => this.api.reorderWorkPhotos(workId, ids), WORK_PHOTO_MESSAGES.saveFailed);
  }

  /** La portada es la primera foto: la pasa al primer lugar. */
  setCover(workId: string, id: string): Promise<boolean> {
    const ids = this.photoIds(workId);
    if (ids[0] === id || !ids.includes(id)) return Promise.resolve(false);
    const order = [id, ...ids.filter((x) => x !== id)];
    return this.run(workId, id, () => this.api.reorderWorkPhotos(workId, order), WORK_PHOTO_MESSAGES.saveFailed);
  }

  /** Pasa una foto a otro trabajo (queda al final). */
  moveToWork(workId: string, id: string, targetId: string): Promise<boolean> {
    return this.run(workId, id, () => this.api.moveWorkPhoto(id, targetId), WORK_PHOTO_MESSAGES.saveFailed);
  }

  restorePhoto(workId: string, id: string): Promise<boolean> {
    return this.run(workId, id, () => this.api.restoreWorkPhoto(id), WORK_PHOTO_MESSAGES.saveFailed);
  }

  private photoIds(workId: string): string[] {
    return (this.works().find((w) => w.id === workId)?.photos ?? []).map((p) => p.id);
  }

  private async run(
    workId: string,
    busyId: string,
    call: () => Observable<WorkList>,
    fallback: string,
    success?: string,
  ): Promise<boolean> {
    if (this.busy()) return false;
    this.error.set(null);
    this.busyId.set(busyId);
    try {
      this.apply(await firstValueFrom(call()));
      if (success) this.toast.show(success, 2200);
      return true;
    } catch (error) {
      this.error.set({ workId, message: messageFor(error, fallback) });
      return false;
    } finally {
      this.busyId.set(null);
    }
  }

  private apply(list: WorkList): void {
    this.works.set(
      list.items.map((w) => ({ ...w, photos: [...w.photos].sort((a, b) => a.sortOrder - b.sortOrder) })),
    );
    this.maxWorks.set(list.maxWorks);
    this.maxStoredWorks.set(list.maxStoredWorks);
    this.photosPerWork.set(list.photosPerWork);
    // El perfil público cacheado ya no coincide.
    this.professionals.invalidate();
  }
}
