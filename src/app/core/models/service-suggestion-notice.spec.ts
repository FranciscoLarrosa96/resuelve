import { notificationAction, notificationCopy, notificationToast, suggestionNoticeText } from './notification';

describe('aviso de un oficio sugerido', () => {
  const base = { professionalName: null, requestTitle: null };

  it('aprobado y sumado a un perfil que ya queda publicado', () => {
    const copy = notificationCopy({
      ...base,
      type: 'PRO_SERVICE_SUGGESTION_APPROVED',
      suggestion: { name: 'Toldos para patios', serviceName: 'Toldos', linked: false, attached: true, published: true },
    });
    expect(copy.title).toBe('Aprobamos tu oficio');
    expect(copy.detail).toContain('Lo sumamos al catálogo como “Toldos”');
    expect(copy.detail).toContain('tu perfil está publicado');
  });

  it('vinculado con un oficio existente, sumado pero con otro requisito pendiente: no dice publicado', () => {
    const detail = suggestionNoticeText({ name: 'X', serviceName: 'Plomería', linked: true, attached: true, published: false }, true).detail;
    expect(detail).toContain('Lo vinculamos con “Plomería”, que ya estaba en Resuelve');
    expect(detail).toContain('falta algo para publicarlo');
    expect(detail).not.toContain('está publicado');
  });

  it('aprobado sin sumarse solo (ya tenía oficios): indica cómo sumarlo', () => {
    const detail = suggestionNoticeText({ name: 'X', serviceName: 'Gas', attached: false }, true).detail;
    expect(detail).toContain('Sumalo a tus servicios desde Mi perfil');
  });

  it('rechazado: explica el motivo y cómo corregirlo o elegir otro oficio', () => {
    const copy = notificationCopy({
      ...base,
      type: 'PRO_SERVICE_SUGGESTION_REJECTED',
      suggestion: { name: 'Magia', reason: 'No es un oficio de servicios.' },
    });
    expect(copy.title).toBe('No aprobamos tu oficio');
    expect(copy.detail).toContain('Motivo: No es un oficio de servicios.');
    expect(copy.detail).toContain('corregir el nombre y volver a sugerirlo, o elegir otro oficio');
  });

  it('el aviso breve no promete publicación', () => {
    expect(notificationToast({ type: 'PRO_SERVICE_SUGGESTION_APPROVED', requestTitle: null })).toBe('Aprobamos el oficio que sugeriste.');
    expect(notificationToast({ type: 'PRO_SERVICE_SUGGESTION_REJECTED', requestTitle: null })).toBe('No aprobamos el oficio que sugeriste.');
  });

  it('cada aviso deja una acción visible para continuar', () => {
    expect(notificationAction({ type: 'PRO_SERVICE_SUGGESTION_APPROVED', suggestion: { name: 'X', attached: true, published: true } })).toBe('Ir a mi panel');
    expect(notificationAction({ type: 'PRO_SERVICE_SUGGESTION_APPROVED', suggestion: { name: 'X', attached: true, published: false } })).toBe('Revisar mi perfil');
    expect(notificationAction({ type: 'PRO_SERVICE_SUGGESTION_APPROVED', suggestion: { name: 'X', attached: false } })).toBe('Sumarlo a mis servicios');
    expect(notificationAction({ type: 'PRO_SERVICE_SUGGESTION_REJECTED' })).toBe('Elegir otro oficio');
    expect(notificationAction({ type: 'PRO_REQUEST_RECEIVED' })).toBeNull();
  });
});
