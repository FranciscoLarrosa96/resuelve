import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { AcquisitionJourney } from './acquisition-journey';
import { profileSource, PublicLinks } from './public-links';
import { RequestStore } from '../state/request.store';
import { RequestDraftStorage } from '../state/request-draft.storage';
import { ProfessionalSummary } from '../models/professional';

describe('Fase 6: enlaces, atribución y continuación', () => {
  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
  });
  it.each([
    ['qr', 'PROFILE_QR'],
    ['share', 'PROFILE_SHARE'],
    [undefined, 'PUBLIC_PROFILE'],
    ['desconocido', 'PUBLIC_PROFILE'],
  ])('origen permitido %s → %s', (src, source) => {
    expect(profileSource(src)).toBe(source);
  });
  it('el enlace usa el slug persistido; QR y compartir son fuentes diferentes', () => {
    const links = TestBed.inject(PublicLinks),
      profile = { id: 'abc', slug: 'francisco-fernandes' };
    expect(links.profile(profile)).toMatch(/\/p\/francisco-fernandes$/);
    expect(links.profile(profile, 'qr')).toMatch(/\?src=qr$/);
    expect(links.profile(profile, 'share')).toMatch(/\?src=share$/);
    expect(links.referral('PRO-ABC')).toMatch(/\/registro\/profesional\?ref=PRO-ABC$/);
  });
  it('navegar y crear un pedido conserva el origen en la pestaña; el contexto no tiene PII', () => {
    const journey = TestBed.inject(AcquisitionJourney);
    journey.capture('PROFILE_QR');
    const store = TestBed.inject(RequestStore);
    store.resetForNewRequest();
    expect(store.acquisitionSource()).toBe('PROFILE_QR');
    expect(JSON.parse(sessionStorage.getItem('resuelve.acquisition')!)).toEqual({
      source: 'PROFILE_QR',
      at: expect.any(Number),
    });
  });
  it('un contexto vencido o desconocido vuelve a marketplace', () => {
    const journey = TestBed.inject(AcquisitionJourney);
    sessionStorage.setItem(
      'resuelve.acquisition',
      JSON.stringify({ source: 'PROFILE_SHARE', at: Date.now() - 13 * 3600000 }),
    );
    expect(journey.source()).toBe('MARKETPLACE');
    sessionStorage.setItem(
      'resuelve.acquisition',
      JSON.stringify({ source: 'IP_TRACKING', at: Date.now() }),
    );
    expect(journey.source()).toBe('MARKETPLACE');
  });
  it('login/recarga recupera el destinatario TARGETED, el origen y el paso de servicio vacío', async () => {
    const store = TestBed.inject(RequestStore);
    store.resetForNewRequest();
    const pro = {
      id: '11111111-1111-4111-8111-111111111111',
      firstName: 'Ana',
      displayName: 'Ana Profesional',
      avatarUrl: null,
      averageRating: null,
      reviewsCount: 0,
      availableToday: true,
      services: [],
      zones: [],
      coversEntireCity: true,
    } as unknown as ProfessionalSummary;
    store.askProfessionals([pro], 'TARGETED', 'PROFILE_SHARE');
    store.acquisitionSource.set('PROFILE_SHARE');
    await TestBed.tick();
    const saved = TestBed.inject(RequestDraftStorage).read();
    expect(saved).toMatchObject({
      flowMode: 'TARGETED',
      attributionSource: 'PROFILE_SHARE',
      acquisitionSource: 'PROFILE_SHARE',
      recipients: [{ id: pro.id }],
    });
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    const restored = TestBed.inject(RequestStore);
    expect(restored.flowMode()).toBe('TARGETED');
    expect(restored.recipientIds()).toEqual([pro.id]);
    expect(restored.acquisitionSource()).toBe('PROFILE_SHARE');
    expect(restored.step()).toBe(0);
    expect(restored.changingCategory()).toBe(true);
  });
});
