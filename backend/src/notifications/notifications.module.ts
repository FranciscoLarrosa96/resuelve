import { Module } from '@nestjs/common';
import { EmailModule } from '../email/email.module';
import { EmailNotificationDispatcher } from './email/email-notification.dispatcher';
import { EmailNotificationScheduler } from './email/email-notification.scheduler';
import { EmailPreferenceService } from './email/email-preference.service';
import { EmailUnsubscribeController, NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

/**
 * Lectura de notificaciones y su envío por email. La creación no pasa por
 * este módulo: cada acción llama a `notify()` dentro de su propia transacción.
 */
@Module({
  imports: [EmailModule],
  controllers: [NotificationsController, EmailUnsubscribeController],
  providers: [NotificationsService, EmailPreferenceService, EmailNotificationDispatcher, EmailNotificationScheduler],
  exports: [EmailNotificationDispatcher],
})
export class NotificationsModule {}
