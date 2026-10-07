import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { PushNotificationScheduler } from './push-notification.scheduler';

const WRITES = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Después de cada request que escribe y salió bien (su transacción ya hizo
 * commit), avisa al scheduler de push. No espera nada ni cambia la respuesta.
 */
@Injectable()
export class PushKickInterceptor implements NestInterceptor {
  constructor(private readonly scheduler: PushNotificationScheduler) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const method = context.switchToHttp().getRequest<{ method: string }>().method;
    if (!WRITES.has(method)) return next.handle();
    return next.handle().pipe(tap({ complete: () => this.scheduler.kick() }));
  }
}
