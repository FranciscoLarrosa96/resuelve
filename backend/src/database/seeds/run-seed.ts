import 'reflect-metadata';
import * as argon2 from 'argon2';
import { EntityManager } from 'typeorm';
import { Appointment, AppointmentStatus } from '../../appointments/appointment.entity';
import { Service } from '../../catalog/service.entity';
import { Zone } from '../../catalog/zone.entity';
import { computeQuoteAmounts } from '../../quotes/quote-totals';
import { Quote } from '../../quotes/quote.entity';
import { QuoteStatus } from '../../quotes/quote.enums';
import { PortfolioItem } from '../../professionals/portfolio-item.entity';
import { recalculateProfessionalMetrics } from '../../professionals/professional-metrics';
import { ProfessionalProfile } from '../../professionals/professional-profile.entity';
import { ProfessionalServiceArea } from '../../professionals/professional-service-area.entity';
import { ProfessionalService } from '../../professionals/professional-service.entity';
import { ProfessionalVerification } from '../../professionals/professional-verification.entity';
import { PlanTier, VerificationStatus, VerificationType } from '../../professionals/professional.enums';
import { RequestInvitation } from '../../requests/request-invitation.entity';
import { InvitationStatus, RequestStatus, RequestUrgency } from '../../requests/request.enums';
import { ServiceRequest } from '../../requests/service-request.entity';
import { Review } from '../../reviews/review.entity';
import { User } from '../../users/user.entity';
import dataSource from '../data-source';
import { seedCatalog } from '../catalog/seed-catalog';
import { CLIENT, DEV_PASSWORD, PROFESSIONALS } from './seed-data';

/**
 * Seed de desarrollo. Uso:
 *   npm run seed                 → carga datos si la base está vacía
 *   SEED_RESET=true npm run seed → vacía las tablas y vuelve a cargar
 * Se niega a correr con NODE_ENV=production.
 */
const slugify = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

/** Fotos de muestra (URLs mock, sin servicio de imágenes real todavía). */
const mockPhoto = (seed: string) => `https://picsum.photos/seed/resuelve-${seed}/800/600`;

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') throw new Error('El seed de desarrollo no corre en producción.');
  await dataSource.initialize();
  try {
    const existing = await dataSource.getRepository(Service).count();
    if (existing > 0 && process.env.SEED_RESET !== 'true') {
      console.log('La base ya tiene datos. Usá SEED_RESET=true npm run seed para recargar.');
      return;
    }
    await dataSource.transaction(async (m) => {
      if (existing > 0) await truncateAll(m);
      await seedDatabase(m);
    });
    console.log(
      `Seed listo. Usuarios de prueba: ${CLIENT.email} y <nombre>@resuelve.dev · contraseña: ${DEV_PASSWORD}`,
    );
  } finally {
    await dataSource.destroy();
  }
}

async function truncateAll(m: EntityManager): Promise<void> {
  const tables: { tablename: string }[] = await m.query(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'typeorm_migrations'`,
  );
  await m.query(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} CASCADE`);
}

/** Carga el set completo de datos de desarrollo. Lo usan `npm run seed` y los tests e2e. */
export async function seedDatabase(m: EntityManager): Promise<void> {
  const passwordHash = await argon2.hash(DEV_PASSWORD, { type: argon2.argon2id });

  // ---- Geografía y catálogo: exactamente el mismo que producción -------
  await seedCatalog(m);
  const zones = new Map((await m.find(Zone)).map((z) => [z.name, z]));
  const services = new Map((await m.find(Service)).map((sv) => [sv.slug, sv]));

  // ---- Clientes -----------------------------------------------------------
  const maria = await m.save(
    m.create(User, {
      firstName: CLIENT.firstName,
      lastName: CLIENT.lastName,
      email: CLIENT.email,
      passwordHash,
      phone: CLIENT.phone,
      phoneVerified: true,
      defaultZoneId: zones.get(CLIENT.zone)!.id,
    }),
  );
  // Secuencial: una transacción usa una sola conexión (sin queries concurrentes).
  const pastClients: User[] = [];
  for (const [firstName, lastName, zone] of [
    ['Mariana', 'López', 'Villa Italia'],
    ['Diego', 'Romero', 'Centro'],
    ['Silvia', 'Molina', 'Uncas'],
  ]) {
    pastClients.push(
      await m.save(
        m.create(User, {
          firstName,
          lastName,
          email: `${slugify(firstName)}.${slugify(lastName)}@resuelve.dev`,
          passwordHash,
          phoneVerified: true,
          defaultZoneId: zones.get(zone)!.id,
        }),
      ),
    );
  }

  // ---- Profesionales ------------------------------------------------------
  const pros = new Map<string, ProfessionalProfile>();
  for (const [index, p] of PROFESSIONALS.entries()) {
    const user = await m.save(
      m.create(User, {
        firstName: p.firstName,
        lastName: p.lastName,
        email: `${p.key}@resuelve.dev`,
        passwordHash,
        phone: `+54 249 45${String(index).padStart(2, '0')} 0${index}0${index}`,
        phoneVerified: true,
        defaultZoneId: zones.get(p.zones[0])!.id,
      }),
    );
    const today = new Date().toISOString().slice(0, 10);
    const profile = await m.save(
      m.create(ProfessionalProfile, {
        userId: user.id,
        headline: p.headline,
        bio: `Trabajo en Tandil hace ${p.years} años. Presupuesto sin cargo y garantía por escrito. ${p.highlight}`,
        yearsExperience: p.years,
        availableToday: p.availableToday,
        availableOn: p.availableToday ? today : null,
        averageResponseMinutes: p.responseMinutes,
        // Todos FREE: PRO se activa solo con `npm run plan:set` (nunca un badge de ejemplo).
        planTier: PlanTier.FREE,
      }),
    );
    pros.set(p.key, profile);
    await m.save(
      p.services.map((slug) =>
        m.create(ProfessionalService, { professionalId: profile.id, serviceId: services.get(slug)!.id }),
      ),
    );
    await m.save(
      p.zones.map((z) =>
        m.create(ProfessionalServiceArea, { professionalId: profile.id, zoneId: zones.get(z)!.id }),
      ),
    );

    const verified = { status: VerificationStatus.VERIFIED, reviewedAt: new Date() };
    await m.save(
      m.create(ProfessionalVerification, {
        professionalId: profile.id,
        type: VerificationType.IDENTITY,
        ...verified,
      }),
    );
    await m.save(
      m.create(ProfessionalVerification, {
        professionalId: profile.id,
        type: VerificationType.PHONE,
        ...verified,
      }),
    );
    if (p.licensed) {
      const licensed = p.services.map((s) => services.get(s)!).find((s) => s.requiresLicense);
      await m.save(
        m.create(ProfessionalVerification, {
          professionalId: profile.id,
          type: VerificationType.LICENSE,
          serviceId: licensed?.id ?? null,
          reference: `Mat. N.º ${4000 + index * 37}`,
          expiresAt: new Date('2027-12-31T00:00:00Z'),
          ...verified,
        }),
      );
    }
    await m.save(
      [0, 1].map((i) =>
        m.create(PortfolioItem, {
          professionalId: profile.id,
          title:
            i === 0 ? `Trabajo de ${services.get(p.services[0])!.name.toLowerCase()}` : 'Trabajo terminado',
          imageUrl: mockPhoto(`${p.key}-${i}`),
          zoneId: zones.get(p.zones[i % p.zones.length])!.id,
          sortOrder: i,
        }),
      ),
    );

    // Trabajos ya cerrados con reseña: de acá salen rating y cantidad de trabajos.
    for (const [i, rating] of p.pastRatings.entries()) {
      const client = pastClients[i % pastClients.length];
      await createClosedJob(m, {
        client,
        pro: profile,
        service: services.get(p.services[0])!,
        zone: zones.get(p.zones[0])!,
        rating,
        index: i,
        highlight: p.highlight,
      });
    }
    await recalculateProfessionalMetrics(m, profile.id);
  }

  // ---- Pedidos en curso de María (espejo de "Mis solicitudes") -----------
  const villaItalia = zones.get('Villa Italia')!;
  const c1 = await m.save(
    m.create(ServiceRequest, {
      clientId: maria.id,
      serviceId: services.get('plomeria')!.id,
      title: 'Pérdida bajo mesada',
      description: 'Tengo una pérdida abajo de la pileta de la cocina. Gotea desde ayer.',
      urgency: RequestUrgency.TODAY,
      zoneId: villaItalia.id,
      desiredDate: new Date().toISOString().slice(0, 10),
      status: RequestStatus.WAITING_QUOTES,
      exactAddress: 'Alem 455, Villa Italia',
      photos: [
        { url: mockPhoto('c1-0'), sortOrder: 0 },
        { url: mockPhoto('c1-1'), sortOrder: 1 },
      ] as never,
    }),
  );
  await invite(
    m,
    c1,
    ['martin', 'luciano', 'marcelo'].map((k) => pros.get(k)!),
  );

  const c2 = await m.save(
    m.create(ServiceRequest, {
      clientId: maria.id,
      serviceId: services.get('electricidad')!.id,
      title: 'Saltan las térmicas',
      description:
        'Cuando prendo el horno eléctrico salta la térmica de la cocina. Pasa desde ayer a la noche.',
      urgency: RequestUrgency.TODAY,
      zoneId: villaItalia.id,
      desiredTimeRange: 'después de las 16',
      status: RequestStatus.QUOTES_RECEIVED,
      exactAddress: 'Alem 455, Villa Italia',
    }),
  );
  await invite(
    m,
    c2,
    ['juan', 'carlos', 'nicolas'].map((k) => pros.get(k)!),
  );
  const carlos = pros.get('carlos')!;
  await m.save(
    m.create(Quote, {
      requestId: c2.id,
      professionalId: carlos.id,
      description: 'Cambio de térmica y disyuntor diferencial. Garantía de 6 meses.',
      ...computeQuoteAmounts({ laborAmount: 40000, items: [{ quantity: 1, unitPrice: 12000 }] }),
      items: [
        { description: 'Disyuntor diferencial 2x25A', quantity: '1.00', unitPrice: '12000.00' },
      ] as never,
      status: QuoteStatus.PENDING,
    }),
  );
  await m.update(
    RequestInvitation,
    { requestId: c2.id, professionalId: carlos.id },
    { status: InvitationStatus.QUOTED, respondedAt: new Date() },
  );

  const hernan = pros.get('hernan')!;
  const c4 = await m.save(
    m.create(ServiceRequest, {
      clientId: maria.id,
      serviceId: services.get('gas')!.id,
      title: 'Revisión de calefactor',
      description: 'El calefactor del living hace llama amarilla. Quiero que lo revisen antes del invierno.',
      urgency: RequestUrgency.FLEXIBLE,
      zoneId: villaItalia.id,
      status: RequestStatus.SCHEDULED,
      exactAddress: 'Alem 455, Villa Italia',
      selectedProfessionalId: hernan.id,
    }),
  );
  await invite(m, c4, [hernan], InvitationStatus.SELECTED);
  const q4 = await m.save(
    m.create(Quote, {
      requestId: c4.id,
      professionalId: hernan.id,
      description: 'Revisión completa, limpieza de quemador y prueba de hermeticidad.',
      ...computeQuoteAmounts({ laborAmount: 35000, materialsAmount: 0 }),
      status: QuoteStatus.ACCEPTED,
      acceptedAt: new Date(),
    }),
  );
  await m.update(ServiceRequest, c4.id, { acceptedQuoteId: q4.id });
  const start = new Date(Date.now() + 24 * 3600 * 1000);
  start.setUTCHours(13, 0, 0, 0);
  await m.save(
    m.create(Appointment, {
      requestId: c4.id,
      quoteId: q4.id,
      professionalId: hernan.id,
      clientId: maria.id,
      scheduledStart: start,
      scheduledEnd: new Date(start.getTime() + 90 * 60 * 1000),
      status: AppointmentStatus.CONFIRMED,
    }),
  );
}

async function invite(
  m: EntityManager,
  request: ServiceRequest,
  pros: ProfessionalProfile[],
  status = InvitationStatus.PENDING,
): Promise<void> {
  await m.save(
    pros.map((p) => m.create(RequestInvitation, { requestId: request.id, professionalId: p.id, status })),
  );
}

async function createClosedJob(
  m: EntityManager,
  args: {
    client: User;
    pro: ProfessionalProfile;
    service: Service;
    zone: Zone;
    rating: number;
    index: number;
    highlight: string;
  },
): Promise<void> {
  const request = await m.save(
    m.create(ServiceRequest, {
      clientId: args.client.id,
      serviceId: args.service.id,
      title: `${args.service.name}: trabajo ${args.index + 1}`,
      description: 'Trabajo realizado a través de Resuelve.',
      zoneId: args.zone.id,
      status: RequestStatus.COMPLETED,
      selectedProfessionalId: args.pro.id,
      completedAt: new Date(Date.now() - (args.index + 1) * 7 * 24 * 3600 * 1000),
    }),
  );
  await invite(m, request, [args.pro], InvitationStatus.SELECTED);
  const quote = await m.save(
    m.create(Quote, {
      requestId: request.id,
      professionalId: args.pro.id,
      description: 'Trabajo acordado.',
      ...computeQuoteAmounts({ laborAmount: 30000 + args.index * 5000, materialsAmount: 8000 }),
      status: QuoteStatus.ACCEPTED,
      acceptedAt: new Date(),
    }),
  );
  await m.update(ServiceRequest, request.id, { acceptedQuoteId: quote.id });
  await m.save(
    m.create(Review, {
      requestId: request.id,
      professionalId: args.pro.id,
      clientId: args.client.id,
      rating: args.rating,
      comment: args.index === 0 ? args.highlight : 'Muy buen trabajo, lo recomiendo.',
    }),
  );
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
