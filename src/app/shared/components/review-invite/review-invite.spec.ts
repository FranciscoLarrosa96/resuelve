import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { ReviewInvite } from './review-invite';

describe('ReviewInvite', () => {
  function render(
    profile: { id: string; slug?: string; invitedReviewsCount?: number },
    opts: { compact?: boolean; highlight?: boolean } = {},
  ) {
    const fixture = TestBed.createComponent(ReviewInvite);
    fixture.componentRef.setInput('profile', profile);
    if (opts.compact) fixture.componentRef.setInput('compact', true);
    if (opts.highlight) fixture.componentRef.setInput('highlight', true);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('WhatsApp lleva un enlace fijo a la pantalla de reseña del profesional', () => {
    const el = render({ id: 'pro-1', slug: 'juan-plomero' });
    const href = (el.querySelector('[data-testid="review-invite-whatsapp"]') as HTMLAnchorElement).href;
    expect(href).toContain('https://wa.me/?text=');
    expect(decodeURIComponent(href)).toContain('/p/juan-plomero/resenar');
    expect(el.querySelector('#pedir-resenas')).not.toBeNull();
  });

  it('sin slug usa el id', () => {
    const el = render({ id: 'pro-1' });
    const href = (el.querySelector('[data-testid="review-invite-whatsapp"]') as HTMLAnchorElement).href;
    expect(decodeURIComponent(href)).toContain('/profesional/pro-1/resenar');
  });

  it('dice de entrada que es para trabajos por fuera de Resuelve y que no cambia el puntaje', () => {
    const el = render({ id: 'pro-1' });
    const text = el.textContent ?? '';
    expect(text.indexOf('Para trabajos por fuera de Resuelve')).toBeLessThan(
      text.indexOf('Sumá reseñas de tus clientes de siempre'),
    );
    expect(text).toContain('Cliente invitado por el profesional');
    expect(text).toContain('no cambian tu puntaje');
  });

  it('tres acciones separadas: WhatsApp principal, Mostrar QR y Copiar enlace; el QR también se amplía desde la miniatura', () => {
    const el = render({ id: 'pro-1' });
    expect(el.querySelector('[data-testid="review-invite-whatsapp"]')?.className).toContain('button-primary');
    const labels = [...el.querySelectorAll('section button')].map((b) => b.textContent?.trim());
    expect(labels).toContain('Mostrar QR');
    expect(labels).toContain('Copiar enlace');
    expect(el.querySelector('[aria-label="Ampliar el QR para dejar una reseña"]')).not.toBeNull();
  });

  it('compacto: WhatsApp secundario salvo que el Inicio la destaque', () => {
    const quiet = render({ id: 'pro-1' }, { compact: true });
    expect(quiet.querySelector('[data-testid="review-invite-whatsapp"]')?.className).toContain('button-secondary');
    TestBed.resetTestingModule();
    const loud = render({ id: 'pro-1' }, { compact: true, highlight: true });
    const wa = loud.querySelector('[data-testid="review-invite-whatsapp"]')!;
    expect(wa.className).toContain('button-primary');
    expect(wa.textContent).toContain('Pedir por WhatsApp');
  });

  it('compacto: muestra cuántas reseñas de invitados sumó, solo con el dato real', () => {
    const count = (n?: number) => {
      TestBed.resetTestingModule();
      return render({ id: 'pro-1', invitedReviewsCount: n }, { compact: true })
        .querySelector('[data-testid="review-invite-count"]')?.textContent?.trim();
    };
    expect(count(undefined)).toBeUndefined();
    expect(count(0)).toBe('Todavía sin reseñas de invitados');
    expect(count(1)).toBe('1 reseña de cliente invitado');
    expect(count(4)).toBe('4 reseñas de clientes invitados');
  });

  it('copiar confirma "Copiado" en el botón', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const fixture = TestBed.createComponent(ReviewInvite);
    fixture.componentRef.setInput('profile', { id: 'pro-1', slug: 'juan-plomero' });
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const copy = [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('Copiar enlace'))!;
    copy.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('/p/juan-plomero/resenar'));
    expect(copy.textContent?.trim()).toBe('Copiado');
    expect(el.querySelector('[role="status"]')?.textContent).toContain('Enlace copiado.');
  });
});
