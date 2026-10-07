import { of, throwError, lastValueFrom } from 'rxjs';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { isAllowedPushEndpoint } from './push-endpoint';
import { PUSH_COPY } from './push-copy';
import { isQuietHour, pushPayload } from './push-notification.dispatcher';
import { PushKickInterceptor } from './push-kick.interceptor';
import type { PushNotificationScheduler } from './push-notification.scheduler';

/** 02:00 y 10:00 en Argentina (UTC-3). */
const at = (arHour: number) => new Date(Date.UTC(2026, 9, 7, (arHour + 3) % 24));

describe('horario de silencio', () => {
  it('23 → 8 cruza la medianoche', () => {
    expect(isQuietHour(at(23), 23, 8)).toBe(true);
    expect(isQuietHour(at(2), 23, 8)).toBe(true);
    expect(isQuietHour(at(7), 23, 8)).toBe(true);
    expect(isQuietHour(at(8), 23, 8)).toBe(false);
    expect(isQuietHour(at(22), 23, 8)).toBe(false);
  });
  it('ventana dentro del día y sin silencio', () => {
    expect(isQuietHour(at(13), 13, 15)).toBe(true);
    expect(isQuietHour(at(15), 13, 15)).toBe(false);
    expect(isQuietHour(at(3), 0, 0)).toBe(false);
  });
});

describe('servicios de push admitidos', () => {
  it.each([
    'https://fcm.googleapis.com/fcm/send/abc',
    'https://updates.push.services.mozilla.com/wpush/v2/abc',
    'https://web.push.apple.com/QAbc',
    'https://wns2-par02p.notify.windows.com/w/?token=abc',
  ])('acepta %s', (url) => expect(isAllowedPushEndpoint(url)).toBe(true));
  it.each([
    'http://fcm.googleapis.com/fcm/send/abc',
    'https://fcm.googleapis.com.evil.com/x',
    'https://evil.com/fcm.googleapis.com',
    'https://user:pass@fcm.googleapis.com/x',
    'https://fcm.googleapis.com:8443/x',
    'https://localhost/x',
    'https://10.0.0.1/x',
    'no es una url',
  ])('rechaza %s', (url) => expect(isAllowedPushEndpoint(url)).toBe(false));
});

describe('contenido del push', () => {
  it('formato del service worker de Angular, con la pantalla al tocar', () => {
    const payload = JSON.parse(pushPayload({ title: 'T', body: 'B' }, '/pro/agenda', 'tag-1'));
    expect(payload.notification).toMatchObject({
      title: 'T',
      body: 'B',
      tag: 'tag-1',
      data: { onActionClick: { default: { operation: 'navigateLastFocusedOrOpen', url: '/pro/agenda' } } },
    });
  });
  it('reseñas y referidos no salen como push', () => {
    for (const t of ['PRO_REVIEW_RECEIVED', 'CLIENT_REVIEW_AVAILABLE', 'PRO_REFERRAL_REGISTERED', 'PRO_REFERRAL_ACTIVATED', 'PRO_BONUS_GRANTED']) {
      expect(PUSH_COPY[t as keyof typeof PUSH_COPY]).toBeUndefined();
    }
    expect(PUSH_COPY.PRO_REQUEST_RECEIVED).toBeDefined();
    expect(PUSH_COPY.CLIENT_QUOTE_RECEIVED).toBeDefined();
  });
});

describe('PushKickInterceptor', () => {
  const ctx = (method: string) =>
    ({ getType: () => 'http', switchToHttp: () => ({ getRequest: () => ({ method }) }) }) as unknown as ExecutionContext;
  const setup = () => {
    const kick = jest.fn();
    return { kick, interceptor: new PushKickInterceptor({ kick } as unknown as PushNotificationScheduler) };
  };
  it('una escritura que sale bien dispara un ciclo', async () => {
    const { kick, interceptor } = setup();
    await lastValueFrom(interceptor.intercept(ctx('POST'), { handle: () => of({ ok: true }) } as CallHandler));
    expect(kick).toHaveBeenCalledTimes(1);
  });
  it('lecturas y errores no', async () => {
    const { kick, interceptor } = setup();
    await lastValueFrom(interceptor.intercept(ctx('GET'), { handle: () => of(1) } as CallHandler));
    await expect(
      lastValueFrom(interceptor.intercept(ctx('PATCH'), { handle: () => throwError(() => new Error('x')) } as CallHandler)),
    ).rejects.toThrow('x');
    expect(kick).not.toHaveBeenCalled();
  });
});
