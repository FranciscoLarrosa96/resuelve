import { businessToday } from '../common/time';
import { CloudinaryDocumentStorage, verificationFolder } from '../verifications/document-storage';
import { parseArgs, isRemoteDatabase } from '../common/cli';
import type { ProfessionalVerification } from './professional-verification.entity';
import {
  hasValidLicense,
  EligibilityProfile,
  effectiveVerificationStatus,
  featuredIneligibility,
  isTakingUrgencies,
  licenseState,
  requestIneligibility,
  URGENT_AVAILABILITY_HOURS,
  urgentAvailabilityUntil,
} from './professional-rules';
import { ProfessionalStatus, VerificationStatus, VerificationType } from './professional.enums';

const GAS = { id: 'gas', requiresLicense: true };
const PLOMERIA = { id: 'plomeria', requiresLicense: false };
const license = (overrides: Partial<ProfessionalVerification>): ProfessionalVerification =>
  ({
    id: 'v',
    type: VerificationType.LICENSE,
    serviceId: 'gas',
    status: VerificationStatus.VERIFIED,
    expiresAt: null,
    createdAt: new Date('2026-09-01T12:00:00Z'),
    ...overrides,
  }) as ProfessionalVerification;

describe('día de negocio en Argentina', () => {
  it('23:59 en Tandil sigue siendo el mismo día aunque en UTC ya sea mañana', () => {
    // 2026-09-26 02:59 UTC = 2026-09-25 23:59 en Argentina (UTC-3).
    expect(businessToday(new Date('2026-09-26T02:59:00Z'))).toBe('2026-09-25');
    expect(businessToday(new Date('2026-09-26T03:00:00Z'))).toBe('2026-09-26');
  });
});

describe('"Tomo urgencias" vale 12 h desde que se prende, a cualquier hora', () => {
  it('prendido a las 23:30 de Argentina sigue valiendo de madrugada y vence solo a las 12 h', () => {
    // 2026-09-26 02:30 UTC = 2026-09-25 23:30 en Argentina.
    const on = new Date('2026-09-26T02:30:00Z');
    const p = { availableUntil: urgentAvailabilityUntil(on) };
    expect(URGENT_AVAILABILITY_HOURS).toBe(12);
    expect(isTakingUrgencies(p, new Date('2026-09-26T06:00:00Z'))).toBe(true); // 3:00 de Argentina
    expect(isTakingUrgencies(p, new Date('2026-09-26T14:29:00Z'))).toBe(true);
    expect(isTakingUrgencies(p, new Date('2026-09-26T14:30:00Z'))).toBe(false);
    expect(isTakingUrgencies({ availableUntil: null }, on)).toBe(false);
  });
});

describe('reglas de matrícula', () => {
  const now = new Date('2026-09-26T12:00:00Z');

  it('seleccionar un servicio con matrícula no la verifica', () => {
    expect(licenseState([], GAS, now)).toBe('NOT_SUBMITTED');
    expect(licenseState([], PLOMERIA, now)).toBe('NOT_REQUIRED');
  });

  it('pendiente y rechazada no habilitan; aprobada y vigente sí', () => {
    for (const status of [VerificationStatus.PENDING, VerificationStatus.REJECTED]) {
      expect(licenseState([license({ status })], GAS, now)).toBe(status);
    }
    expect(licenseState([license({})], GAS, now)).toBe(VerificationStatus.VERIFIED);
  });

  it('una aprobada vencida pasa a EXPIRED y deja de contar', () => {
    const expired = license({ expiresAt: new Date('2026-09-20T00:00:00Z') });
    expect(effectiveVerificationStatus(expired, now)).toBe(VerificationStatus.EXPIRED);
    expect(licenseState([expired], GAS, now)).toBe(VerificationStatus.EXPIRED);
  });

  it('la matrícula de otro servicio no habilita este (genérico, sin nombres)', () => {
    const other = license({ serviceId: 'electricidad' });
    expect(hasValidLicense([other], GAS.id, now)).toBe(false);
  });

  it('el estado es el del último envío (el rechazo viejo queda como historial)', () => {
    const rejected = license({ status: VerificationStatus.REJECTED, createdAt: new Date('2026-09-01T00:00:00Z') });
    const pending = license({ status: VerificationStatus.PENDING, createdAt: new Date('2026-09-10T00:00:00Z') });
    expect(licenseState([rejected, pending], GAS, now)).toBe(VerificationStatus.PENDING);
  });
});

describe('upload privado (Cloudinary)', () => {
  const storage = new CloudinaryDocumentStorage({ cloudName: 'demo', apiKey: 'key', apiSecret: 'abcd' });

  it('firma como documenta Cloudinary', () => {
    expect(
      storage.sign({
        eager: 'w_400,h_300,c_pad|w_260,h_200,c_crop',
        public_id: 'sample_image',
        timestamp: '1315060510',
      }),
    ).toBe('bfd09f95f331f558cbd1320e67aa8d488770583e');
  });

  it('la firma fija carpeta del profesional, tipo privado y formatos; nunca incluye el secret', () => {
    const ticket = storage.createUploadTicket(verificationFolder('pro-123'));
    expect(ticket.publicId.startsWith('resuelve/verifications/pro-123/')).toBe(true);
    expect(ticket.fields).toMatchObject({ type: 'private', allowed_formats: 'pdf,jpg,png,webp', public_id: ticket.publicId });
    expect(JSON.stringify(ticket)).not.toContain('abcd');
    expect(ticket.maxBytes).toBe(10 * 1024 * 1024);
  });

  it('sin credenciales no está configurado', () => {
    expect(new CloudinaryDocumentStorage({}).configured).toBe(false);
  });
});

describe('CLI de revisión', () => {
  it('interpreta comandos y flags', () => {
    expect(parseArgs(['reject', 'abc', '--reason', 'No se lee', '--purge-document'])).toEqual({
      command: 'reject',
      id: 'abc',
      flags: { reason: 'No se lee', 'purge-document': true },
    });
  });

  it('pide confirmación contra una base remota o en producción', () => {
    expect(isRemoteDatabase('postgres://u:p@127.0.0.1:5433/db', 'development')).toBe(false);
    expect(isRemoteDatabase('postgres://u:p@dpg-xyz.oregon-postgres.render.com/db', 'development')).toBe(true);
    expect(isRemoteDatabase('postgres://u:p@localhost/db', 'production')).toBe(true);
  });
});

describe('requestIneligibility: una sola regla para invitar y presupuestar', () => {
  const TANDIL = 'tandil';
  const RAUCH = 'rauch';
  const MAR_DEL_PLATA = 'mar-del-plata';
  const CENTRO = 'centro';
  const VILLA_ITALIA = 'villa-italia';
  const pro = (overrides: Partial<EligibilityProfile> = {}): EligibilityProfile => ({
    status: ProfessionalStatus.ACTIVE,
    serviceIds: ['plomeria', 'gas'],
    localities: [{ cityId: TANDIL, coversEntireCity: false }],
    zoneIds: [CENTRO],
    ...overrides,
  });
  const plomeriaEn = (zoneId: string | null, cityId = TANDIL) => ({ service: PLOMERIA, cityId, zoneId });

  it('solo Centro no recibe una solicitud de Villa Italia', () => {
    expect(requestIneligibility(pro(), plomeriaEn(VILLA_ITALIA))).toBe('ZONE_NOT_COVERED');
    expect(requestIneligibility(pro(), plomeriaEn(CENTRO))).toBeNull();
  });

  it('"Toda la ciudad" cubre cualquier barrio de ESA localidad sin tener barrios guardados', () => {
    const todoTandil = pro({ localities: [{ cityId: TANDIL, coversEntireCity: true }], zoneIds: [] });
    expect(requestIneligibility(todoTandil, plomeriaEn(VILLA_ITALIA))).toBeNull();
    expect(requestIneligibility(todoTandil, plomeriaEn(null))).toBeNull();
  });

  it('una solicitud de Mar del Plata nunca le llega a quien solo cubre Tandil (aunque cubra toda la ciudad)', () => {
    const todoTandil = pro({ localities: [{ cityId: TANDIL, coversEntireCity: true }] });
    expect(requestIneligibility(todoTandil, plomeriaEn(null, MAR_DEL_PLATA))).toBe('LOCALITY_NOT_COVERED');
  });

  it('cobertura múltiple: Tandil por barrios y todo Rauch, con un solo perfil', () => {
    const multi = pro({
      localities: [
        { cityId: TANDIL, coversEntireCity: false },
        { cityId: RAUCH, coversEntireCity: true },
      ],
    });
    expect(requestIneligibility(multi, plomeriaEn(CENTRO))).toBeNull();
    expect(requestIneligibility(multi, plomeriaEn(null, RAUCH))).toBeNull();
    expect(requestIneligibility(multi, plomeriaEn(null, MAR_DEL_PLATA))).toBe('LOCALITY_NOT_COVERED');
  });

  it('sin barrio (localidad sin barrios cargados) solo alcanza "toda la ciudad"', () => {
    expect(requestIneligibility(pro(), plomeriaEn(null))).toBe('ZONE_NOT_COVERED');
  });

  it('perfil pausado no recibe solicitudes', () => {
    expect(requestIneligibility(pro({ status: ProfessionalStatus.PAUSED }), plomeriaEn(CENTRO))).toBe('PROFILE_PAUSED');
  });

  it('servicio no ofrecido', () => {
    expect(requestIneligibility(pro({ serviceIds: ['gas'] }), plomeriaEn(CENTRO))).toBe('SERVICE_NOT_OFFERED');
  });

  it('la matrícula no restringe: un servicio que la requiere se recibe sin matrícula verificada', () => {
    expect(requestIneligibility(pro(), { service: GAS, cityId: TANDIL, zoneId: CENTRO })).toBeNull();
  });

  it('al presupuestar no se vuelve a exigir la cobertura (la invitación ya valida)', () => {
    expect(requestIneligibility(pro(), plomeriaEn(VILLA_ITALIA), { checkCoverage: false })).toBeNull();
    expect(
      requestIneligibility(pro({ status: ProfessionalStatus.PAUSED }), plomeriaEn(VILLA_ITALIA), { checkCoverage: false }),
    ).toBe('PROFILE_PAUSED');
  });
});

describe('espacios destacados: PRO no alcanza, tiene que cumplir las reglas públicas', () => {
  const zone = { active: true, cityId: 'tandil' };
  const base = {
    status: ProfessionalStatus.ACTIVE,
    services: [{ service: { ...PLOMERIA, active: true } }],
    localities: [{ cityId: 'tandil', coversEntireCity: false, city: { active: true } }],
    serviceAreas: [{ zone }],
  };

  it('PRO activo con servicio público y barrio: elegible', () => {
    expect(featuredIneligibility(base, true)).toBeNull();
    expect(
      featuredIneligibility(
        { ...base, serviceAreas: [], localities: [{ cityId: 'rauch', coversEntireCity: true, city: { active: true } }] },
        true,
      ),
    ).toBeNull();
  });

  it('sin el entitlement (Free o PRO vencido) nunca es elegible', () => {
    expect(featuredIneligibility(base, false)).toBe('NOT_PRO');
  });

  it('pausado, sin servicio público o sin cobertura: no', () => {
    expect(featuredIneligibility({ ...base, status: ProfessionalStatus.PAUSED }, true)).toBe('PROFILE_PAUSED');
    // Un servicio regulado sin matrícula verificada cuenta igual: la matrícula no restringe.
    expect(featuredIneligibility({ ...base, services: [{ service: { ...GAS, active: true } }] }, true)).toBeNull();
    expect(
      featuredIneligibility({ ...base, services: [{ service: { ...PLOMERIA, active: false } }] }, true),
    ).toBe('NO_PUBLIC_SERVICE');
    expect(featuredIneligibility({ ...base, serviceAreas: [{ zone: { ...zone, active: false } }] }, true)).toBe(
      'NO_COVERAGE',
    );
    // Un barrio de otra ciudad no cubre la localidad.
    expect(featuredIneligibility({ ...base, serviceAreas: [{ zone: { ...zone, cityId: 'azul' } }] }, true)).toBe(
      'NO_COVERAGE',
    );
    expect(featuredIneligibility({ ...base, localities: [] }, true)).toBe('NO_COVERAGE');
  });
});
