import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

/**
 * Lectura de notificaciones. La creación no pasa por este módulo: cada
 * acción llama a `notify()` dentro de su propia transacción.
 */
@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService],
})
export class NotificationsModule {}
