import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { AppException } from '../../common/errors/app-exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { AVATAR_STORAGE, AvatarStorage, WORK_PHOTO_DELIVERY } from '../avatar/avatar-storage';
import { ProfessionalProfile } from '../professional-profile.entity';
import { ProfessionalWorkPhoto } from './work-photo.entity';
import { listWorkPhotos, presentWorkPhoto } from './work-photo.presenter';
import {
  ALLOWED_WORK_PHOTO_FORMATS,
  MAX_WORK_PHOTO_BYTES,
  MAX_WORK_PHOTOS,
  captionProblem,
  normalizeCaption,
  workPhotoFolder,
} from './work-photo-rules';

/**
 * "Trabajos realizados" del profesional (máximo 5 fotos públicas).
 *
 * - Subida firmada directo a Cloudinary (mismo patrón que el avatar): el
 *   backend firma carpeta, nombre y formatos, y al confirmar consulta formato
 *   y peso REALES al proveedor. El API Secret nunca sale del servidor.
 * - El tope de 5 se garantiza bajo lock del perfil (`pessimistic_write`):
 *   dos confirmaciones simultáneas con 4 fotos → una entra y la otra 409.
 * - Solo el dueño opera (la ruta usa el perfil del token; una foto ajena → 403).
 */
@Injectable()
export class WorkPhotosService {
  private readonly logger = new Logger(WorkPhotosService.name);

  constructor(
    private readonly dataSource: DataSource,
    @Inject(AVATAR_STORAGE) private readonly storage: AvatarStorage,
  ) {}

  async list(profile: ProfessionalProfile) {
    return this.present(this.dataSource.manager, profile.id);
  }

  /** Firma de subida. Si ya tiene 5, avisa antes de que suba nada. */
  async uploadTicket(profile: ProfessionalProfile) {
    this.assertStorage();
    const count = await this.dataSource.manager.count(ProfessionalWorkPhoto, { where: { professionalId: profile.id } });
    if (count >= MAX_WORK_PHOTOS) throw this.limitReached();
    return this.storage.createUploadTicket(workPhotoFolder(profile.id), MAX_WORK_PHOTO_BYTES);
  }

  /** Confirma una foto subida: valida con el proveedor y la agrega al final (máximo 5). */
  async add(profile: ProfessionalProfile, publicId: string, rawCaption?: string | null) {
    this.assertStorage();
    const caption = this.validCaption(rawCaption);
    if (!publicId.startsWith(`${workPhotoFolder(profile.id)}/`)) throw AppException.notFound('Foto');
    const stored = await this.storage.inspect(publicId);
    if (!stored) throw AppException.notFound('Foto');
    if (
      !(ALLOWED_WORK_PHOTO_FORMATS as readonly string[]).includes(stored.format) ||
      stored.bytes > MAX_WORK_PHOTO_BYTES
    ) {
      this.forget(publicId);
      throw AppException.unprocessable(ErrorCode.INVALID_IMAGE, 'La foto tiene que ser JPG, PNG o WebP de hasta 8 MB', {
        allowedFormats: ALLOWED_WORK_PHOTO_FORMATS,
        maxBytes: MAX_WORK_PHOTO_BYTES,
      });
    }

    const outcome = await this.dataSource.transaction(async (m) => {
      await this.lockProfile(m, profile.id);
      // Reintento de la misma confirmación: idempotente.
      if (await m.exists(ProfessionalWorkPhoto, { where: { publicId: stored.publicId } })) return 'ok' as const;
      const photos = await listWorkPhotos(m, profile.id);
      if (photos.length >= MAX_WORK_PHOTOS) return 'full' as const;
      await m.insert(ProfessionalWorkPhoto, {
        professionalId: profile.id,
        publicId: stored.publicId,
        imageUrl: this.storage.deliveryUrl(stored, WORK_PHOTO_DELIVERY),
        sortOrder: photos.length ? Math.max(...photos.map((p) => p.sortOrder)) + 1 : 0,
        caption,
      });
      return 'ok' as const;
    });
    if (outcome === 'full') {
      // Subió de más (dos pestañas): la foto no queda huérfana en Cloudinary.
      this.forget(stored.publicId);
      throw this.limitReached();
    }
    return this.list(profile);
  }

  async updateCaption(profile: ProfessionalProfile, id: string, rawCaption: string | null) {
    const caption = this.validCaption(rawCaption);
    await this.dataSource.transaction(async (m) => {
      const photo = await this.owned(m, profile, id);
      await m.update(ProfessionalWorkPhoto, photo.id, { caption });
    });
    return this.list(profile);
  }

  /**
   * Borra primero en Cloudinary y recién después la fila, dentro de la misma
   * transacción: si el proveedor falla, la foto sigue en el perfil y se puede
   * reintentar (nunca una fila que apunta a un archivo borrado ni un archivo
   * público huérfano sin avisar).
   */
  async remove(profile: ProfessionalProfile, id: string) {
    await this.dataSource.transaction(async (m) => {
      await this.lockProfile(m, profile.id);
      const photo = await this.owned(m, profile, id);
      if (this.storage.configured) {
        try {
          await this.storage.destroy(photo.publicId);
        } catch (error) {
          this.logger.warn(`No se pudo borrar la foto de trabajo ${photo.id}: ${(error as Error).message}`);
          throw new AppException(
            ErrorCode.WORK_PHOTO_DELETE_FAILED,
            'No pudimos borrar la foto. Probá de nuevo en unos minutos.',
            HttpStatus.BAD_GATEWAY,
          );
        }
      }
      await m.delete(ProfessionalWorkPhoto, photo.id);
      await this.renumber(m, (await listWorkPhotos(m, profile.id)).map((p) => p.id));
    });
    return this.list(profile);
  }

  /** Nuevo orden: exactamente las fotos del perfil, sin repetir. */
  async reorder(profile: ProfessionalProfile, ids: string[]) {
    await this.dataSource.transaction(async (m) => {
      await this.lockProfile(m, profile.id);
      const current = (await listWorkPhotos(m, profile.id)).map((p) => p.id);
      const same = ids.length === current.length && new Set(ids).size === ids.length && ids.every((id) => current.includes(id));
      if (!same)
        throw AppException.unprocessable(
          ErrorCode.INVALID_WORK_PHOTO_ORDER,
          'El orden tiene que incluir todas tus fotos una sola vez',
        );
      await this.renumber(m, ids);
    });
    return this.list(profile);
  }

  private async present(m: EntityManager, professionalId: string) {
    const photos = await listWorkPhotos(m, professionalId);
    return { items: photos.map(presentWorkPhoto), max: MAX_WORK_PHOTOS, maxBytes: MAX_WORK_PHOTO_BYTES };
  }

  private async renumber(m: EntityManager, ids: string[]): Promise<void> {
    for (const [i, id] of ids.entries()) await m.update(ProfessionalWorkPhoto, id, { sortOrder: i });
  }

  /** Foto del perfil del token; de otro perfil → 403, inexistente → 404. */
  private async owned(m: EntityManager, profile: ProfessionalProfile, id: string): Promise<ProfessionalWorkPhoto> {
    const photo = await m.findOne(ProfessionalWorkPhoto, { where: { id } });
    if (!photo) throw AppException.notFound('Foto');
    if (photo.professionalId !== profile.id) throw AppException.forbidden('Esta foto no es de tu perfil');
    return photo;
  }

  private lockProfile(m: EntityManager, professionalId: string) {
    return m.findOneOrFail(ProfessionalProfile, { where: { id: professionalId }, lock: { mode: 'pessimistic_write' } });
  }

  private validCaption(raw: string | null | undefined): string | null {
    const caption = normalizeCaption(raw);
    const problem = captionProblem(caption);
    if (problem) throw AppException.unprocessable(ErrorCode.INVALID_CAPTION, problem);
    return caption;
  }

  private limitReached(): AppException {
    return AppException.conflict(
      ErrorCode.WORK_PHOTOS_LIMIT_REACHED,
      `Ya alcanzaste el máximo de ${MAX_WORK_PHOTOS} fotos.`,
      { max: MAX_WORK_PHOTOS },
    );
  }

  /** Borra del proveedor sin bloquear la respuesta (si falla, se loguea). */
  private forget(publicId: string): void {
    this.storage.destroy(publicId).catch(() => this.logger.warn('No se pudo borrar una foto de trabajo rechazada'));
  }

  private assertStorage(): void {
    if (!this.storage.configured)
      throw new AppException(
        ErrorCode.UPLOADS_NOT_CONFIGURED,
        'La carga de fotos todavía no está disponible',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
  }
}
