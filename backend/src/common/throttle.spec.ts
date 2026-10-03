import { QuotesController } from '../quotes/quotes.controller';
import { RequestsController } from '../requests/requests.controller';
import { FavoritesController } from '../retention/retention.controller';
import { ReviewsController } from '../reviews/reviews.controller';
import { AuthController } from '../auth/auth.controller';
import { CREATE_LIMIT, WRITE_LIMIT } from './throttle';

const limitOf = (controller: { prototype: object }, method: string): number | undefined =>
  Reflect.getMetadata('THROTTLER:LIMITdefault', (controller.prototype as Record<string, object>)[method]);

describe('límites de frecuencia de escrituras', () => {
  it('lo que llega a otra persona (solicitud, presupuesto, reseña) tiene el límite más estricto', () => {
    expect(limitOf(RequestsController, 'create')).toBe(CREATE_LIMIT);
    expect(limitOf(ReviewsController, 'create')).toBe(CREATE_LIMIT);
    expect(limitOf(QuotesController, 'accept')).toBe(WRITE_LIMIT);
  });

  it('las demás escrituras tienen límite propio, más holgado que crear', () => {
    expect(limitOf(RequestsController, 'invite')).toBe(WRITE_LIMIT);
    expect(limitOf(FavoritesController, 'save')).toBe(WRITE_LIMIT);
    expect(limitOf(FavoritesController, 'unsave')).toBe(WRITE_LIMIT);
    expect(CREATE_LIMIT).toBeLessThan(WRITE_LIMIT);
  });

  it('login y registro siguen con el límite anti fuerza bruta', () => {
    expect(limitOf(AuthController, 'login')).toBeDefined();
    expect(limitOf(AuthController, 'register')).toBeDefined();
  });
});
