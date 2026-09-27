import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppException } from '../../common/errors/app-exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { ProfessionalProfile } from '../professional-profile.entity';
import { ProfessionalsService } from '../professionals.service';
import {
  ALLOWED_AVATAR_FORMATS,
  AVATAR_STORAGE,
  AvatarStorage,
  MAX_AVATAR_BYTES,
  avatarFolder,
} from './avatar-storage';

/** Foto de perfil del profesional: firma, confirmación (validada con el proveedor) y baja. */
@Injectable()
export class ProfessionalAvatarService {
  private readonly logger = new Logger(ProfessionalAvatarService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly professionals: ProfessionalsService,
    @Inject(AVATAR_STORAGE) private readonly storage: AvatarStorage,
  ) {}

  uploadTicket(profile: ProfessionalProfile) {
    this.assertStorage();
    return this.storage.createUploadTicket(avatarFolder(profile.id));
  }

  /**
   * Confirma la foto subida: tiene que estar en SU carpeta (una ajena responde
   * igual que una inexistente) y el formato y el peso se consultan al
   * proveedor. Reemplaza la anterior (se borra del proveedor después de guardar).
   */
  async set(profile: ProfessionalProfile, publicId: string) {
    this.assertStorage();
    if (!publicId.startsWith(`${avatarFolder(profile.id)}/`)) throw AppException.notFound('Foto');
    const stored = await this.storage.inspect(publicId);
    if (!stored) throw AppException.notFound('Foto');
    if (
      !(ALLOWED_AVATAR_FORMATS as readonly string[]).includes(stored.format) ||
      stored.bytes > MAX_AVATAR_BYTES
    ) {
      await this.storage.destroy(publicId).catch(() => undefined);
      throw AppException.unprocessable(
        ErrorCode.INVALID_IMAGE,
        'La foto tiene que ser JPG, PNG o WebP de hasta 5 MB',
        {
          allowedFormats: ALLOWED_AVATAR_FORMATS,
          maxBytes: MAX_AVATAR_BYTES,
        },
      );
    }
    const previous = await this.replace(profile.id, {
      avatarPublicId: stored.publicId,
      avatarUrl: this.storage.deliveryUrl(stored),
    });
    if (previous && previous !== stored.publicId) this.forget(previous);
    return this.professionals.getOwn(profile.id);
  }

  /** "Eliminar foto": vuelven las iniciales. */
  async remove(profile: ProfessionalProfile) {
    const previous = await this.replace(profile.id, { avatarPublicId: null, avatarUrl: null });
    if (previous && this.storage.configured) this.forget(previous);
    return this.professionals.getOwn(profile.id);
  }

  /** Bajo lock del perfil: dos confirmaciones simultáneas no dejan una foto huérfana sin registrar. */
  private replace(
    professionalId: string,
    patch: Pick<ProfessionalProfile, 'avatarPublicId' | 'avatarUrl'>,
  ): Promise<string | null> {
    return this.dataSource.transaction(async (m) => {
      const current = await m.findOneOrFail(ProfessionalProfile, {
        where: { id: professionalId },
        lock: { mode: 'pessimistic_write' },
      });
      await m.update(ProfessionalProfile, professionalId, patch);
      return current.avatarPublicId;
    });
  }

  /** Borra la foto anterior del proveedor sin bloquear la respuesta (si falla, queda huérfana y se loguea). */
  private forget(publicId: string): void {
    this.storage
      .destroy(publicId)
      .catch(() => this.logger.warn('No se pudo borrar una foto de perfil anterior'));
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
