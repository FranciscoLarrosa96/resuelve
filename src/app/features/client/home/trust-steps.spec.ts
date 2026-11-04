import { TestBed } from '@angular/core/testing';
import { TRUST_POINTS } from '../../../core/data/catalog.data';
import { TrustSteps } from './trust-steps';

type Callback = (entries: { isIntersecting: boolean }[]) => void;

describe('TrustSteps (las reglas que te cuidan)', () => {
  let observers: { cb: Callback; disconnect: ReturnType<typeof vi.fn> }[];
  let reduced: boolean;

  beforeEach(() => {
    observers = [];
    reduced = false;
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        disconnect = vi.fn();
        constructor(cb: Callback) {
          observers.push({ cb, disconnect: this.disconnect });
        }
        observe() {}
      },
    );
    vi.stubGlobal('matchMedia', (q: string) => ({
      matches: q.includes('reduce') && reduced,
      addEventListener() {},
      removeEventListener() {},
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  async function render() {
    const fixture = TestBed.createComponent(TrustSteps);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, host: fixture.nativeElement as HTMLElement };
  }

  it('muestra los cuatro pasos con su texto; la lista solo tiene <li> y los íconos son decorativos', async () => {
    const { host } = await render();
    const ol = host.querySelector('ol')!;
    expect([...ol.children].every((c) => c.tagName === 'LI')).toBe(true);
    const items = [...ol.querySelectorAll('li')];
    expect(items.map((li) => li.querySelector('h3')!.textContent!.trim())).toEqual(TRUST_POINTS.map((p) => p.longTitle));
    for (const dot of host.querySelectorAll('.confidence-dot')) expect(dot.getAttribute('aria-hidden')).toBe('true');
    expect(host.querySelector('.confidence-line')!.getAttribute('aria-hidden')).toBe('true');
  });

  it('queda armado fuera de pantalla y se anima una sola vez al entrar', async () => {
    const { fixture, host } = await render();
    expect(host.getAttribute('data-phase')).toBe('armed');
    observers[0].cb([{ isIntersecting: false }]);
    fixture.detectChanges();
    expect(host.getAttribute('data-phase')).toBe('armed');
    observers[0].cb([{ isIntersecting: true }]);
    fixture.detectChanges();
    expect(host.getAttribute('data-phase')).toBe('play');
    expect(observers[0].disconnect).toHaveBeenCalled(); // sin bucles ni repeticiones solas
  });

  it('pasar el mouse repite solo el gesto de ese paso (dibujo nuevo); antes de entrar, no', async () => {
    const { fixture, host } = await render();
    const items = () => [...host.querySelectorAll('li')];
    const svgBefore = items()[2].querySelector('svg');
    items()[2].dispatchEvent(new Event('pointerenter'));
    fixture.detectChanges();
    expect(items()[2].querySelector('svg')).toBe(svgBefore);

    observers[0].cb([{ isIntersecting: true }]);
    fixture.detectChanges();
    items()[2].dispatchEvent(new Event('pointerenter'));
    fixture.detectChanges();
    expect(items()[2].classList).toContain('ts-replay');
    expect(items()[2].querySelector('svg')).not.toBe(svgBefore);
    expect(items()[1].classList).not.toContain('ts-replay');
  });

  it('con movimiento reducido queda quieto en el estado final y no repite', async () => {
    reduced = true;
    const { fixture, host } = await render();
    expect(host.getAttribute('data-phase')).toBe('still');
    expect(observers).toHaveLength(0);
    const svg = host.querySelector('li svg');
    host.querySelector('li')!.dispatchEvent(new Event('pointerenter'));
    fixture.detectChanges();
    expect(host.querySelector('li svg')).toBe(svg);
  });
});
