import { AvatarTone, Professional } from '../models/professional';
import { mockPortrait } from './mock-media';

const GREEN: AvatarTone = { bg: '#E4EFE9', fg: '#1E5B4B' };
const NAVY: AvatarTone = { bg: '#E6ECF3', fg: '#2F4B6E' };
const CLAY: AvatarTone = { bg: '#F6E3D3', fg: '#8A4A1E' };
const SAND: AvatarTone = { bg: '#EFE8D6', fg: '#6B5320' };
const VIOLET: AvatarTone = { bg: '#E8E4F1', fg: '#4B3F7A' };

/** Fotos temporales: ver `mock-media.ts`. Si fallan, el avatar muestra iniciales. */
const photo = mockPortrait;

export const PROFESSIONALS: Professional[] = [
  {
    id: 'carlos', name: 'Carlos Fernández', firstName: 'Carlos', initials: 'CF', tone: GREEN,
    photoUrl: photo('men/32'), trade: 'Electricista matriculado', serviceSlugs: ['electricidad', 'aire-acondicionado'],
    rating: 4.9, reviewsCount: 87, jobsCount: 112, yearsExperience: 14, distanceKm: 2.3, availableToday: true,
    responseTime: '~5 min', responseTimeLong: 'aproximadamente 5 minutos', responseMinutes: 5,
    licenseVerified: true, licenseLabel: 'Electricista matriculado',
    nextSlot: 'Hoy 16:00', nextSlotLong: 'Próximo turno libre: hoy 16:00',
    zones: ['Centro', 'Villa Italia', 'Uncas'],
    highlight: 'Vino en el día, cambió el disyuntor y me explicó qué estaba fallando.', map: { x: 38, y: 34 },
  },
  {
    id: 'juan', name: 'Juan Martín', firstName: 'Juan', initials: 'JM', tone: GREEN,
    photoUrl: photo('men/45'), trade: 'Electricista matriculado', serviceSlugs: ['electricidad'],
    rating: 4.9, reviewsCount: 98, jobsCount: 126, yearsExperience: 11, distanceKm: 3.4, availableToday: true,
    responseTime: '~10 min', responseTimeLong: 'aproximadamente 10 minutos', responseMinutes: 10,
    licenseVerified: true, licenseLabel: 'Electricista matriculado',
    nextSlot: 'Hoy 17:30', nextSlotLong: 'Próximo turno libre: hoy 17:30',
    zones: ['Centro', 'Uncas', 'Villa Aguirre'],
    highlight: 'Llegó puntual, encontró el problema enseguida y explicó todo.', map: { x: 62, y: 28 },
  },
  {
    id: 'nicolas', name: 'Nicolás Herrera', firstName: 'Nicolás', initials: 'NH', tone: NAVY,
    photoUrl: photo('men/22'), trade: 'Electricista', serviceSlugs: ['electricidad'],
    rating: 4.7, reviewsCount: 41, jobsCount: 58, yearsExperience: 6, distanceKm: 4.8, availableToday: false,
    responseTime: '~25 min', responseTimeLong: 'aproximadamente 25 minutos', responseMinutes: 25,
    licenseVerified: false,
    nextSlot: 'Mañana 9:00', nextSlotLong: 'Próximo turno libre: mañana 9:00',
    zones: ['La Movediza', 'Centro'],
    highlight: 'Muy prolijo con los cables, dejó todo ordenado.', map: { x: 22, y: 62 },
  },
  {
    id: 'martin', name: 'Martín Gómez', firstName: 'Martín', initials: 'MG', tone: CLAY,
    photoUrl: photo('men/52'), trade: 'Plomero y gasista matriculado', serviceSlugs: ['plomeria', 'gas'],
    rating: 4.9, reviewsCount: 121, jobsCount: 203, yearsExperience: 18, distanceKm: 3.1, availableToday: true,
    responseTime: '~15 min', responseTimeLong: 'aproximadamente 15 minutos', responseMinutes: 15,
    licenseVerified: true, licenseLabel: 'Gasista matriculado',
    nextSlot: 'Hoy 18:00', nextSlotLong: 'Próximo turno libre: hoy 18:00',
    zones: ['Villa Italia', 'Centro', 'Villa Aguirre'],
    highlight: 'Cambió el flexible del termotanque en media hora. Impecable.', map: { x: 57, y: 50 },
  },
  {
    id: 'luciano', name: 'Luciano Rodríguez', firstName: 'Luciano', initials: 'LR', tone: NAVY,
    photoUrl: photo('men/36'), trade: 'Plomero', serviceSlugs: ['plomeria'],
    rating: 4.8, reviewsCount: 64, jobsCount: 90, yearsExperience: 9, distanceKm: 1.6, availableToday: true,
    responseTime: '~10 min', responseTimeLong: 'aproximadamente 10 minutos', responseMinutes: 10,
    licenseVerified: false,
    nextSlot: 'Hoy 16:30', nextSlotLong: 'Próximo turno libre: hoy 16:30',
    zones: ['Villa Italia', 'Uncas'],
    highlight: 'Encontró la pérdida sin romper nada. Súper recomendable.', map: { x: 44, y: 70 },
  },
  {
    id: 'marcelo', name: 'Marcelo Ríos', firstName: 'Marcelo', initials: 'MR', tone: SAND,
    photoUrl: photo('men/61'), trade: 'Plomería y destapaciones', serviceSlugs: ['plomeria'],
    rating: 4.9, reviewsCount: 52, jobsCount: 77, yearsExperience: 12, distanceKm: 2.1, availableToday: true,
    responseTime: '~3 min', responseTimeLong: 'aproximadamente 3 minutos', responseMinutes: 3,
    licenseVerified: false,
    nextSlot: 'Ahora, urgencias', nextSlotLong: 'Disponible ahora para urgencias',
    zones: ['Centro', 'La Movediza', 'Villa Italia'],
    highlight: 'Lo llamé a las 23 y a los 20 minutos estaba en casa.', map: { x: 72, y: 42 },
  },
  {
    id: 'walter', name: 'Walter Medina', firstName: 'Walter', initials: 'WM', tone: VIOLET,
    photoUrl: photo('men/41'), trade: 'Plomero y gasista matriculado', serviceSlugs: ['plomeria', 'gas'],
    rating: 4.7, reviewsCount: 58, jobsCount: 84, yearsExperience: 13, distanceKm: 3.8, availableToday: true,
    responseTime: '~20 min', responseTimeLong: 'aproximadamente 20 minutos', responseMinutes: 20,
    licenseVerified: true, licenseLabel: 'Gasista matriculado',
    nextSlot: 'Hoy 19:00', nextSlotLong: 'Próximo turno libre: hoy 19:00',
    zones: ['Centro', 'Uncas'],
    highlight: 'Resolvió una filtración que otros no encontraban.', map: { x: 28, y: 40 },
  },
  {
    id: 'ezequiel', name: 'Ezequiel Paz', firstName: 'Ezequiel', initials: 'EP', tone: NAVY,
    photoUrl: photo('men/15'), trade: 'Plomero', serviceSlugs: ['plomeria'],
    rating: 4.6, reviewsCount: 29, jobsCount: 37, yearsExperience: 4, distanceKm: 5.2, availableToday: false,
    responseTime: '~35 min', responseTimeLong: 'aproximadamente 35 minutos', responseMinutes: 35,
    licenseVerified: false,
    nextSlot: 'Mañana 8:30', nextSlotLong: 'Próximo turno libre: mañana 8:30',
    zones: ['La Movediza'],
    highlight: 'Buen precio y trabajo limpio.', map: { x: 82, y: 22 },
  },
  {
    id: 'hernan', name: 'Hernán Castro', firstName: 'Hernán', initials: 'HC', tone: CLAY,
    photoUrl: photo('men/67'), trade: 'Gasista matriculado', serviceSlugs: ['gas'],
    rating: 4.8, reviewsCount: 73, jobsCount: 101, yearsExperience: 15, distanceKm: 2.7, availableToday: true,
    responseTime: '~8 min', responseTimeLong: 'aproximadamente 8 minutos', responseMinutes: 8,
    licenseVerified: true, licenseLabel: 'Gasista matriculado',
    nextSlot: 'Hoy 15:00', nextSlotLong: 'Próximo turno libre: hoy 15:00',
    zones: ['Centro', 'Uncas'],
    highlight: 'Hizo la prueba de hermeticidad y me dejó el certificado.', map: { x: 34, y: 26 },
  },
  {
    id: 'diego', name: 'Diego Sosa', firstName: 'Diego', initials: 'DS', tone: VIOLET,
    photoUrl: photo('men/11'), trade: 'Cerrajero', serviceSlugs: ['cerrajeria'],
    rating: 4.8, reviewsCount: 76, jobsCount: 140, yearsExperience: 10, distanceKm: 1.9, availableToday: true,
    responseTime: '~4 min', responseTimeLong: 'aproximadamente 4 minutos', responseMinutes: 4,
    licenseVerified: false,
    nextSlot: 'Ahora, urgencias', nextSlotLong: 'Disponible ahora para urgencias',
    zones: ['Todo Tandil'],
    highlight: 'Me abrió la puerta sin dañar la cerradura. Rapidísimo.', map: { x: 50, y: 30 },
  },
  {
    id: 'gustavo', name: 'Gustavo Benítez', firstName: 'Gustavo', initials: 'GB', tone: NAVY,
    photoUrl: photo('men/75'), trade: 'Cerrajero', serviceSlugs: ['cerrajeria'],
    rating: 4.6, reviewsCount: 33, jobsCount: 61, yearsExperience: 7, distanceKm: 3.9, availableToday: true,
    responseTime: '~12 min', responseTimeLong: 'aproximadamente 12 minutos', responseMinutes: 12,
    licenseVerified: false,
    nextSlot: 'Hoy 14:00', nextSlotLong: 'Próximo turno libre: hoy 14:00',
    zones: ['Centro', 'Villa Aguirre'],
    highlight: 'Cambió la combinación completa en una hora.', map: { x: 76, y: 64 },
  },
  {
    id: 'laura', name: 'Laura Pérez', firstName: 'Laura', initials: 'LP', tone: CLAY,
    photoUrl: photo('women/44'), trade: 'Pintora de interiores', serviceSlugs: ['pintura'],
    rating: 5.0, reviewsCount: 38, jobsCount: 52, yearsExperience: 8, distanceKm: 2.2, availableToday: false,
    responseTime: '~30 min', responseTimeLong: 'aproximadamente 30 minutos', responseMinutes: 30,
    licenseVerified: false,
    nextSlot: 'Lunes', nextSlotLong: 'Próximo turno libre: lunes',
    zones: ['Centro', 'Villa Italia', 'Uncas'],
    highlight: 'Cumplió los plazos y cuidó cada mueble. Quedó hermoso.', map: { x: 34, y: 58 },
  },
  {
    id: 'sofia', name: 'Sofía Álvarez', firstName: 'Sofía', initials: 'SÁ', tone: VIOLET,
    photoUrl: photo('women/65'), trade: 'Pintura y revestimientos', serviceSlugs: ['pintura'],
    rating: 4.8, reviewsCount: 22, jobsCount: 31, yearsExperience: 5, distanceKm: 3.0, availableToday: false,
    responseTime: '~20 min', responseTimeLong: 'aproximadamente 20 minutos', responseMinutes: 20,
    licenseVerified: false,
    nextSlot: 'Mañana', nextSlotLong: 'Próximo turno libre: mañana',
    zones: ['Centro', 'La Movediza'],
    highlight: 'Muy prolija y el presupuesto fue exacto.', map: { x: 66, y: 72 },
  },
  {
    id: 'pablo', name: 'Pablo Acosta', firstName: 'Pablo', initials: 'PA', tone: NAVY,
    photoUrl: photo('men/28'), trade: 'Técnico en aire acondicionado', serviceSlugs: ['aire-acondicionado'],
    rating: 4.8, reviewsCount: 59, jobsCount: 88, yearsExperience: 10, distanceKm: 2.8, availableToday: false,
    responseTime: '~15 min', responseTimeLong: 'aproximadamente 15 minutos', responseMinutes: 15,
    licenseVerified: true, licenseLabel: 'Técnico matriculado',
    nextSlot: 'Mañana 10:00', nextSlotLong: 'Próximo turno libre: mañana 10:00',
    zones: ['Centro', 'Villa Italia'],
    highlight: 'Instaló el split en tres horas y dejó todo limpio.', map: { x: 58, y: 38 },
  },
  {
    id: 'ramon', name: 'Ramón Quiroga', firstName: 'Ramón', initials: 'RQ', tone: SAND,
    photoUrl: photo('men/81'), trade: 'Albañil', serviceSlugs: ['albanileria'],
    rating: 4.7, reviewsCount: 47, jobsCount: 66, yearsExperience: 22, distanceKm: 4.1, availableToday: false,
    responseTime: '~40 min', responseTimeLong: 'aproximadamente 40 minutos', responseMinutes: 40,
    licenseVerified: false,
    nextSlot: 'La semana próxima', nextSlotLong: 'Próximo turno libre: la semana próxima',
    zones: ['Todo Tandil'],
    highlight: 'Arregló la humedad del muro y no volvió a aparecer.', map: { x: 20, y: 30 },
  },
  {
    id: 'raul', name: 'Raúl Medina', firstName: 'Raúl', initials: 'RM', tone: NAVY,
    trade: 'Fletes, mudanzas y retiro de muebles', serviceSlugs: ['fletes', 'mudanzas', 'retiro-de-muebles'],
    rating: 4.8, reviewsCount: 34, jobsCount: 56, yearsExperience: 9, distanceKm: 3.2, availableToday: true,
    responseTime: '~8 min', responseTimeLong: 'aproximadamente 8 minutos', responseMinutes: 8,
    licenseVerified: false, nextSlot: 'Hoy 17:00', nextSlotLong: 'Próximo turno libre: hoy 17:00',
    zones: ['Centro', 'Villa Italia'], highlight: 'Llegó a horario y cuidó todos los muebles.', map: { x: 48, y: 52 },
  },
  {
    id: 'oscar', name: 'Óscar Sosa', firstName: 'Óscar', initials: 'OS', tone: GREEN,
    trade: 'Jardinería, corte de pasto y poda', serviceSlugs: ['corte-de-pasto', 'jardineria', 'poda'],
    rating: 4.9, reviewsCount: 41, jobsCount: 72, yearsExperience: 12, distanceKm: 2.6, availableToday: false,
    responseTime: '~5 min', responseTimeLong: 'aproximadamente 5 minutos', responseMinutes: 5,
    licenseVerified: false, nextSlot: 'Mañana 9:00', nextSlotLong: 'Próximo turno libre: mañana 9:00',
    zones: ['Centro', 'Uncas'], highlight: 'Dejó el jardín impecable y retiró los restos.', map: { x: 42, y: 62 },
  },
];

/** Profesional con el que se "loguea" el área pro en el prototipo. */
export const CURRENT_PRO_ID = 'juan';

/** Selecciones editoriales del Home. */
export const LIVE_NOW_IDS = ['marcelo', 'diego', 'carlos', 'martin'];
export const FEATURED_IDS = ['juan', 'laura', 'martin'];
export const TRUST_EXAMPLE_ID = 'juan';
