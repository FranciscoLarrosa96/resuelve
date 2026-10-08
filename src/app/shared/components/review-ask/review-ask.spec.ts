import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { ReviewAsk } from './review-ask';

async function setup(name: string | null) {
  const fixture = TestBed.createComponent(ReviewAsk);
  fixture.componentRef.setInput('requestId', 'req-9');
  fixture.componentRef.setInput('clientFirstName', name);
  await fixture.whenStable();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

describe('ReviewAsk', () => {
  afterEach(() => vi.useRealTimers());

  it('WhatsApp principal con el mensaje y el enlace del trabajo; sin nombre, "tu cliente"', async () => {
    const { el } = await setup(null);
    expect(el.querySelector('h2')?.textContent).toContain('Pedile la reseña a tu cliente');
    const wa = el.querySelector<HTMLAnchorElement>('[data-testid="review-ask-whatsapp"]')!;
    expect(wa.className).toContain('button-primary');
    const text = decodeURIComponent(wa.href);
    expect(text.startsWith('https://wa.me/?text=')).toBe(true);
    expect(text).toContain('¿Me dejás una reseña en Resuelve?');
    expect(text).toMatch(/\/mis-solicitudes\/req-9#resena$/);
  });

  it('copiar muestra "Copiado" en el botón y vuelve solo', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const { fixture, el } = await setup('Laura');
    expect(el.querySelector('h2')?.textContent).toContain('Pedile la reseña a Laura');
    vi.useFakeTimers();
    const copy = el.querySelector('button')!;
    copy.click();
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();
    expect(writeText).toHaveBeenCalledWith(
      expect.stringMatching(/\/mis-solicitudes\/req-9#resena$/),
    );
    expect(copy.textContent?.trim()).toBe('Copiado');
    vi.advanceTimersByTime(2600);
    fixture.detectChanges();
    expect(copy.textContent?.trim()).toBe('Copiar enlace');
  });

  it('si no se puede copiar, deja el enlace a la vista para copiarlo a mano', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('no')) },
      configurable: true,
    });
    const { fixture, el } = await setup('Laura');
    el.querySelector('button')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain(
      '/mis-solicitudes/req-9#resena',
    );
  });
});
