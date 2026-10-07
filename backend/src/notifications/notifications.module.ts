import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { EmailModule } from '../email/email.module';
import { EmailNotificationDispatcher } from './email/email-notification.dispatcher';
import { EmailNotificationScheduler } from './email/email-notification.scheduler';
import { EmailPreferenceService } from './email/email-preference.service';
import { EmailUnsubscribeController, NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { PushController } from './push/push.controller';
import { PushKickInterceptor } from './push/push-kick.interceptor';
import { PushNotificationDispatcher } from './push/push-notification.dispatcher';
import { PushNotificationScheduler } from './push/push-notification.scheduler';
import { PUSH_SENDER, WebPushSender } from './push/push-sender';
import { PushSubscriptionsService } from './push/push-subscriptions.service';

/**
 * Lectura de notificaciones y su envío por email y push. La creación no pasa
 * por este módulo: cada acción llama a `notify()` dentro de su propia transacción.
 */
@Module({
  imports: [EmailModule],
  controllers: [NotificationsController, EmailUnsubscribeController, PushController],
  providers: [
    NotificationsService,
    EmailPreferenceService,
    EmailNotificationDispatcher,
    EmailNotificationScheduler,
    {
      provide: PUSH_SENDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new WebPushSender({
          publicKey: config.get<string>('VAPID_PUBLIC_KEY'),
          privateKey: config.get<string>('VAPID_PRIVATE_KEY'),
          subject: config.get<string>('VAPID_SUBJECT'),
        }),
    },
    PushSubscriptionsService,
    PushNotificationDispatcher,
    PushNotificationScheduler,
    { provide: APP_INTERCEPTOR, useClass: PushKickInterceptor },
  ],
  exports: [EmailNotificationDispatcher, PushNotificationDispatcher],
})
export class NotificationsModule {}
