import { HttpTestingController } from '@angular/common/http/testing';

/**
 * Tests: responde vacío a los pedidos de las herramientas del profesional
 * (consultas, reseñas propias, plantillas y "Sumar profesionales") que hacen las pantallas al abrir.
 * Devuelve cuántos respondió (para quien quiera afirmarlo).
 */
export function flushProTools(http: HttpTestingController): number {
  const pending = http.match(
    (req) =>
      /\/questions$/.test(req.url) ||
      /\/pro\/reviews$/.test(req.url) ||
      /\/pro\/quote-templates$/.test(req.url) ||
      /\/invitation-options$/.test(req.url),
  );
  flushNoWorks(http);
  // El detalle de una solicitud lee el plan propio (ProStore) para el aviso de pérdida: sin perfil, nada.
  http
    .match((req) => req.url.endsWith('/pro/me'))
    .forEach((req) => req.cancelled || req.flush(null, { status: 404, statusText: 'Not Found' }));
  for (const req of pending) {
    if (req.cancelled) continue;
    const url = req.request.url;
    // "Sumar profesionales" del detalle del cliente: sin nada que ofrecer.
    if (/\/invitation-options$/.test(url)) req.flush({ state: 'NOT_APPLICABLE', emphasis: 'NONE', candidates: [], directContacts: [] });
    else if (/\/pro\/requests\/[^/]+\/questions$/.test(url)) req.flush({ items: [], canAsk: false, max: 3 });
    else if (/\/questions$/.test(url)) req.flush({ groups: [], canAnswer: true });
    else if (/\/pro\/reviews$/.test(url)) req.flush({ items: [], page: 1, pageSize: 20, total: 0 });
    else req.flush({ items: [], max: 20 });
  }
  return pending.length;
}

/** Tests: "Tu mes" que pide Mi plan al abrir; sin datos (404) la página no muestra los paneles de valor. */
export function flushMonth(http: HttpTestingController): void {
  http
    .match((req) => req.url.endsWith('/pro/analytics/month'))
    .forEach((req) => req.cancelled || req.flush(null, { status: 404, statusText: 'Not Found' }));
  flushNoWorks(http);
}

/** Tests: los trabajos que pide Mi plan para la vista previa de Destacado (sin trabajos = fotos de ejemplo). */
export function flushNoWorks(http: HttpTestingController): void {
  http.match((req) => req.url.endsWith('/pro/profile/works')).forEach(
    (req) =>
      req.cancelled ||
      req.flush({
        items: [],
        maxWorks: 1,
        activeWorks: 0,
        maxStoredWorks: 10,
        photosPerWork: 5,
        activePhotos: 0,
        maxBytes: 8 * 1024 * 1024,
      }),
  );
}
