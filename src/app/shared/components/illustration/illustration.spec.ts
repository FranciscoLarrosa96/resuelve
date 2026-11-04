import { TestBed } from '@angular/core/testing';
import { Illustration, IllustrationScene } from './illustration';

describe('Illustration', () => {
  const scenes: IllustrationScene[] = ['sent', 'search', 'requests', 'quiet', 'sprout'];

  it.each(scenes)('"%s" es decorativa, sin texto y con el ancho pedido', (scene) => {
    const fixture = TestBed.createComponent(Illustration);
    fixture.componentRef.setInput('scene', scene);
    fixture.componentRef.setInput('size', 140);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.getAttribute('aria-hidden')).toBe('true');
    expect(host.getAttribute('data-scene')).toBe(scene);
    expect(host.style.width).toBe('140px');
    const svg = host.querySelector('svg')!;
    expect(svg.querySelectorAll('path, circle, rect, ellipse').length).toBeGreaterThan(3);
    // Sin texto: lo que pasa lo dice la pantalla, no el dibujo.
    expect(svg.querySelector('text')).toBeNull();
    expect(host.textContent!.trim()).toBe('');
  });

  it('search: la campana del "Avisame" aparece solo si se pide', () => {
    const fixture = TestBed.createComponent(Illustration);
    fixture.componentRef.setInput('scene', 'search');
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('.il-bell-accent')).toBeNull();
    fixture.componentRef.setInput('alert', true);
    fixture.detectChanges();
    expect(host.querySelector('.il-bell-accent')).not.toBeNull();
  });

  it.each([
    [1, 1],
    [2, 2],
    [3, 3],
    [6, 3],
  ])(
    'sent: con %s destinatarios dibuja %s personas (nunca más de las reales)',
    (recipients, drawn) => {
      const fixture = TestBed.createComponent(Illustration);
      fixture.componentRef.setInput('scene', 'sent');
      fixture.componentRef.setInput('recipients', recipients);
      fixture.detectChanges();
      expect((fixture.nativeElement as HTMLElement).querySelectorAll('.il-team > g').length).toBe(
        drawn,
      );
    },
  );

  it('usa solo tokens de color: ningún hex en los atributos del dibujo', () => {
    for (const scene of scenes) {
      const fixture = TestBed.createComponent(Illustration);
      fixture.componentRef.setInput('scene', scene);
      fixture.detectChanges();
      const markup = (fixture.nativeElement as HTMLElement).innerHTML;
      expect(markup).not.toMatch(/(fill|stroke)="#/);
    }
  });
});
