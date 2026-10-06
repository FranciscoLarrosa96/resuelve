import { TestBed } from '@angular/core/testing';
import { ReviewInvite } from './review-invite';

describe('ReviewInvite', () => {
  function render(profile: { id: string; slug?: string }) {
    const fixture = TestBed.createComponent(ReviewInvite);
    fixture.componentRef.setInput('profile', profile);
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

  it('aclara que van aparte y no cambian el puntaje', () => {
    const el = render({ id: 'pro-1' });
    expect(el.textContent).toContain('Cliente invitado por el profesional');
    expect(el.textContent).toContain('No cambian tu puntaje');
  });
});
