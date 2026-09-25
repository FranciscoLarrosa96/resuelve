import { ClientRequest, StageMeta } from '../models/service-request';

export const STAGES: StageMeta[] = [
  { label: 'Esperando respuestas', bg: '#FCEEDD', fg: '#6A4418', dot: '#C9711F' },
  { label: 'Presupuestos recibidos', bg: '#E6ECF3', fg: '#2F4B6E', dot: '#2F4B6E', action: 'Elegí un presupuesto' },
  { label: 'Profesional seleccionado', bg: '#E8E4F1', fg: '#4B3F7A', dot: '#4B3F7A', action: 'Confirmá la fecha' },
  { label: 'Trabajo programado', bg: '#E4EFE9', fg: '#164538', dot: '#1E5B4B' },
  { label: 'Finalizado', bg: '#F2EEE6', fg: '#3F4742', dot: '#8A918C' },
  { label: 'Pendiente de reseña', bg: '#C9711F', fg: '#FFFFFF', dot: '#C9711F', action: 'Dejá tu reseña' },
];

export const STAGE_STEP_LABELS = ['Enviada', 'Presupuestos', 'Elegido', 'Programado', 'Finalizado'];

export const REVIEW_TAGS = ['Puntual', 'Prolijo', 'Buen precio', 'Explicó todo', 'Lo recomiendo'];

export const RATING_LABELS = ['Tocá una estrella', 'Malo', 'Regular', 'Bueno', 'Muy bueno', 'Excelente'];

export const CLIENT_REQUESTS: ClientRequest[] = [
  {
    id: 'c1', title: 'Pérdida bajo mesada', category: 'Plomería', zone: 'Villa Italia', date: 'Hoy, 10:42',
    stage: 0, professionalIds: ['martin', 'luciano', 'marcelo'],
  },
  {
    id: 'c2', title: 'Saltan las térmicas', category: 'Electricidad', zone: 'Villa Italia', date: 'Ayer, 21:15',
    stage: 1, professionalIds: ['juan', 'carlos', 'nicolas'],
    quotes: [
      { professionalId: 'juan', amount: 48500, slot: 'Hoy 17:30', description: 'Revisión del circuito de cocina y cambio de térmica. Materiales incluidos.' },
      { professionalId: 'carlos', amount: 52000, slot: 'Hoy 16:00', description: 'Cambio de térmica y disyuntor diferencial. Garantía de 6 meses.' },
    ],
  },
  {
    id: 'c3', title: 'Pintar dormitorio', category: 'Pintura', zone: 'Villa Italia', date: '18 sep',
    stage: 2, professionalIds: ['laura'], chosenId: 'laura', amount: 210000,
  },
  {
    id: 'c4', title: 'Revisión de calefactor', category: 'Gas', zone: 'Villa Italia', date: '15 sep',
    stage: 3, professionalIds: ['hernan'], chosenId: 'hernan', amount: 35000, when: 'Vie 25 sep · 10:00',
  },
  {
    id: 'c5', title: 'Cambio de cerradura', category: 'Cerrajería', zone: 'Villa Italia', date: '12 sep',
    stage: 5, professionalIds: ['diego'], chosenId: 'diego', amount: 42000, when: 'Terminado el 20 sep',
  },
  {
    id: 'c6', title: 'Instalación de split', category: 'Aire acondicionado', zone: 'Villa Italia', date: '2 sep',
    stage: 4, professionalIds: ['pablo'], chosenId: 'pablo', amount: 95000, when: 'Terminado el 6 sep',
    myRating: 5, myReview: 'Rápido y prolijo. Dejó todo limpio.',
  },
];
