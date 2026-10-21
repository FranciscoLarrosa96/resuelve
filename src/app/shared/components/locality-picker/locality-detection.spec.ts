import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { LocalityDetection } from './locality-detection';
import { LocationApiService } from '../../../core/api/location-api.service';
import { LocalitiesApiService } from '../../../core/api/localities-api.service';
import { GeolocationError, GeolocationService } from '../../../core/services/geolocation.service';
import { LocalityStore } from '../../../core/state/locality.store';
import { LocationStore } from '../../../core/state/location.store';
import { TEST_LOCALITY } from '../../../core/state/locality.testing';

function setup(enabled = true) {
  const geo = { supported: true, current: vi.fn().mockResolvedValue({ lat: -37, lng: -59 }) };
  const reverse = vi.fn().mockReturnValue(of({ suggestedLocality: { id: TEST_LOCALITY.id } }));
  const get = vi.fn().mockReturnValue(of(TEST_LOCALITY));
  const version = signal(0);
  TestBed.configureTestingModule({
    providers: [
      { provide: GeolocationService, useValue: geo },
      { provide: LocationApiService, useValue: { reverse } },
      { provide: LocalitiesApiService, useValue: { get } },
      { provide: LocalityStore, useValue: { version } },
      { provide: LocationStore, useValue: { enabled: signal(enabled), load: vi.fn() } },
    ],
  });
  const fixture = TestBed.createComponent(LocalityDetection);
  const picked = vi.fn();
  fixture.componentInstance.picked.subscribe(picked);
  fixture.detectChanges();
  const host = fixture.nativeElement as HTMLElement;
  const button = (text: string) =>
    [...host.querySelectorAll('button')].find((b) => b.textContent!.includes(text))!;
  const locate = async () => {
    button('Usar mi ubicación').click();
    await fixture.whenStable();
    fixture.detectChanges();
  };
  return { geo, reverse, get, version, fixture, picked, host, button, locate };
}

describe('detectar localidad para buscar', () => {
  it('no pide permiso al cargar; resuelve por id y emite solo después de confirmar', async () => {
    const c = setup();
    expect(c.geo.current).not.toHaveBeenCalled();
    await c.locate();
    expect(c.reverse).toHaveBeenCalledWith(-37, -59);
    expect(c.get).toHaveBeenCalledWith(TEST_LOCALITY.id);
    expect(c.host.textContent).toContain('Tandil, Buenos Aires');
    expect(c.picked).not.toHaveBeenCalled();
    c.button('Usar esta localidad').click();
    expect(c.picked).toHaveBeenCalledWith(TEST_LOCALITY);
  });
  it('permiso denegado no consulta el proveedor y conserva la alternativa manual', async () => {
    const c = setup();
    c.geo.current.mockRejectedValue(new GeolocationError('denied'));
    await c.locate();
    expect(c.reverse).not.toHaveBeenCalled();
    expect(c.host.textContent).toContain('a mano');
  });
  it('sin proveedor o sin soporte no ofrece una detección que no puede hacer', () => {
    const c = setup(false);
    expect(c.host.querySelector('button')).toBeNull();
    expect(c.geo.current).not.toHaveBeenCalled();
  });
  it('sin coincidencia inequívoca no inventa una localidad', async () => {
    const c = setup();
    c.reverse.mockReturnValue(of({ suggestedLocality: null }));
    await c.locate();
    expect(c.get).not.toHaveBeenCalled();
    expect(c.host.textContent).toContain('con certeza');
    expect(c.picked).not.toHaveBeenCalled();
  });
  it('error del proveedor permite reintentar', async () => {
    const c = setup();
    c.reverse.mockReturnValueOnce(throwError(() => new Error('503')));
    await c.locate();
    expect(c.host.textContent).toContain('Reintentá');
    await c.locate();
    expect(c.host.querySelector('[data-testid="detected-locality"]')).not.toBeNull();
  });
  it('una elección nueva invalida una detección anterior incluso antes de confirmarla', async () => {
    const c = setup();
    await c.locate();
    c.version.update((v) => v + 1);
    c.button('Usar esta localidad').click();
    expect(c.picked).not.toHaveBeenCalled();
  });
  it('cerrar el selector descarta una respuesta GPS tardía sin consultar coordenadas', async () => {
    const c = setup();
    let resolve!: (p: { lat: number; lng: number }) => void;
    c.geo.current.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    c.button('Usar mi ubicación').click();
    c.fixture.destroy();
    resolve({ lat: 1, lng: 2 });
    await Promise.resolve();
    expect(c.reverse).not.toHaveBeenCalled();
    expect(c.picked).not.toHaveBeenCalled();
  });
});
