import { HttpTestingController } from '@angular/common/http/testing';

/**
 * Tests: responde vacío a los pedidos de las herramientas del profesional
 * (consultas, reseñas propias y plantillas) que hacen las pantallas al abrir.
 * Devuelve cuántos respondió (para quien quiera afirmarlo).
 */
export function flushProTools(http: HttpTestingController): number {
  const pending = http.match(
    (req) => /\/questions$/.test(req.url) || /\/pro\/reviews$/.test(req.url) || /\/pro\/quote-templates$/.test(req.url),
  );
  for (const req of pending) {
    if (req.cancelled) continue;
    const url = req.request.url;
    if (/\/pro\/requests\/[^/]+\/questions$/.test(url)) req.flush({ items: [], canAsk: false, max: 3 });
    else if (/\/questions$/.test(url)) req.flush({ groups: [], canAnswer: true });
    else if (/\/pro\/reviews$/.test(url)) req.flush({ items: [], page: 1, pageSize: 20, total: 0 });
    else req.flush({ items: [], max: 20 });
  }
  return pending.length;
}
