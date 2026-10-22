import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { AppException } from '../../common/errors/app-exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { readUnsubscribeToken } from './unsubscribe-token';

/** Preferencia de avisos por email: desde Mi perfil o con el enlace de baja del mensaje. */
@Injectable()
export class EmailPreferenceService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {}

  /** Configuración de envío, sin claves ni datos del proveedor. No certifica entrega en la casilla. */
  deliveryConfig(): { deliveryEnabled: boolean } {
    return {
      deliveryEnabled: this.config.get<boolean>('EMAIL_NOTIFICATIONS_ENABLED', true) &&
        !!(this.config.get<string>('RESEND_API_KEY') || this.config.get<string>('SMTP_HOST')),
    };
  }

  async set(userId: string, enabled: boolean): Promise<{ enabled: boolean; deliveryEnabled: boolean }> {
    await this.dataSource.query(`UPDATE users SET email_notifications = $2 WHERE id = $1`, [userId, enabled]);
    return { enabled, ...this.deliveryConfig() };
  }

  /** Idempotente. Un token inválido es 400; no revela si la cuenta existe. */
  async unsubscribe(token: string): Promise<void> {
    const userId = readUnsubscribeToken(this.config.getOrThrow<string>('JWT_ACCESS_SECRET'), token);
    if (!userId) {
      throw new AppException(
        ErrorCode.INVALID_UNSUBSCRIBE_TOKEN,
        'El enlace de baja no es válido',
        HttpStatus.BAD_REQUEST,
      );
    }
    await this.set(userId, false);
  }
}
