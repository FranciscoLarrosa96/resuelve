import { businessToday } from '../common/time';
import { CloudinaryDocumentStorage, verificationFolder } from '../verifications/document-storage';
import { parseArgs, isRemoteDatabase } from '../common/cli';
import type { ProfessionalVerification } from './professional-verification.entity';
import { isAvailableToday } from './professional.presenter';
import {
  canOfferService,
  EligibilityProfile,
  effectiveVerificationStatus,
  licenseState,
  requestIneligibility,
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

describe('"Disponible hoy" vence a medianoche de Argentina', () => {
  it('23:59 en Tandil sigue siendo el mismo día aunque en UTC ya sea mañana', () => {
    // 2026-09-26 02:59 UTC = 2026-09-25 23:59 en Argentina (UTC-3).
    expect(businessToday(new Date('2026-09-26T02:59:00Z'))).toBe('2026-09-25');
    expect(businessToday(new Date('2026-09-26T03:00:00Z'))).toBe('2026-09-26');
  });

  it('marcado un día, deja de valer al siguiente sin que nadie lo apague', () => {
    const p = { availableToday: true, availableOn: '2026-09-25' };
    expect(isAvailableToday(p, '2026-09-25')).toBe(true);
    expect(isAvailableToday(p, '2026-09-26')).toBe(false);
    expect(isAvailableToday({ availableToday: false, availableOn: '2026-09-25' }, '2026-09-25')).toBe(false);
  });
});

describe('reglas de matrícula', () => {
  const now = new Date('2026-09-26T12:00:00Z');

  it('seleccionar un servicio con matrícula no la verifica', () => {
    expect(canOfferService({ verifications: [] }, GAS, now)).toBe(false);
    expect(canOfferService({ verifications: [] }, PLOMERIA, now)).toBe(true);
    expect(licenseState([], GAS, now)).toBe('NOT_SUBMITTED');
    expect(licenseState([], PLOMERIA, now)).toBe('NOT_REQUIRED');
  });

  it('pendiente y rechazada no habilitan; aprobada y vigente sí', () => {
    for (const status of [VerificationStatus.PENDING, VerificationStatus.REJECTED]) {
      expect(canOfferService({ verifications: [license({ status })] }, GAS, now)).toBe(false);
      expect(licenseState([license({ status })], GAS, now)).toBe(status);
    }
    expect(canOfferService({ verifications: [license({})] }, GAS, now)).toBe(true);
  });

  it('una aprobada vencida pasa a EXPIRED y deja de contar', () => {
    const expired = license({ expiresAt: new Date('2026-09-20T00:00:00Z') });
    expect(effectiveVerificationStatus(expired, now)).toBe(VerificationStatus.EXPIRED);
    expect(canOfferService({ verifications: [expired] }, GAS, now)).toBe(false);
    expect(licenseState([expired], GAS, now)).toBe(VerificationStatus.EXPIRED);
  });

  it('la matrícula de otro servicio no habilita este (genérico, sin nombres)', () => {
    const other = license({ serviceId: 'electricidad' });
    expect(canOfferService({ verifications: [other] }, GAS, now)).toBe(false);
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
  const CENTRO = 'centro';
  const VILLA_ITALIA = 'villa-italia';
  const pro = (overrides: Partial<EligibilityProfile> = {}): EligibilityProfile => ({
    status: ProfessionalStatus.ACTIVE,
    coversEntireCity: false,
    serviceIds: ['plomeria', 'gas'],
    zoneIds: [CENTRO],
    verifications: [],
    ...overrides,
  });
  const plomeriaEn = (zoneId: string) => ({ service: PLOMERIA, zoneId });

  it('solo Centro no recibe una solicitud de Villa Italia', () => {
    expect(requestIneligibility(pro(), plomeriaEn(VILLA_ITALIA))).toBe('ZONE_NOT_COVERED');
    expect(requestIneligibility(pro(), plomeriaEn(CENTRO))).toBeNull();
  });

  it('"Todo Tandil" cubre cualquier barrio sin tener zonas guardadas', () => {
    expect(requestIneligibility(pro({ coversEntireCity: true, zoneIds: [] }), plomeriaEn(VILLA_ITALIA))).toBeNull();
  });

  it('perfil pausado no recibe solicitudes', () => {
    expect(requestIneligibility(pro({ status: ProfessionalStatus.PAUSED }), plomeriaEn(CENTRO))).toBe('PROFILE_PAUSED');
  });

  it('servicio no ofrecido', () => {
    expect(requestIneligibility(pro({ serviceIds: ['gas'] }), plomeriaEn(CENTRO))).toBe('SERVICE_NOT_OFFERED');
  });

  it('servicio con matrícula: pendiente o vencida no alcanza; aprobada y vigente sí', () => {
    const gas = { service: GAS, zoneId: CENTRO };
    expect(requestIneligibility(pro(), gas)).toBe('SERVICE_NOT_OFFERED');
    expect(requestIneligibility(pro({ verifications: [license({ status: VerificationStatus.PENDING })] }), gas)).toBe(
      'SERVICE_NOT_OFFERED',
    );
    const expired = license({ expiresAt: new Date('2026-01-01T00:00:00Z') });
    expect(requestIneligibility(pro({ verifications: [expired] }), gas, { now: new Date('2026-09-01T00:00:00Z') })).toBe(
      'SERVICE_NOT_OFFERED',
    );
    expect(requestIneligibility(pro({ verifications: [license({})] }), gas)).toBeNull();
  });

  it('al presupuestar no se vuelve a exigir la cobertura (la invitación ya valida)', () => {
    expect(requestIneligibility(pro(), plomeriaEn(VILLA_ITALIA), { checkCoverage: false })).toBeNull();
    expect(
      requestIneligibility(pro({ status: ProfessionalStatus.PAUSED }), plomeriaEn(VILLA_ITALIA), { checkCoverage: false }),
    ).toBe('PROFILE_PAUSED');
  });
});
