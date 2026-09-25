import { ClientRequest, StageMeta } from '../models/service-request';

export const STAGES: StageMeta[] = [
  { label: 'Esperando respuestas', bg: '#FCEEDD', fg: '#6A4418', dot: '#C9711F' },
  { label: 'Presupuestos recibidos', bg: '#E6ECF3', fg: '#2F4B6E', dot: '#2F4B6E', action: 'Elegí un presupuesto' },
  { label: 'Profesional seleccionado', bg: '#E8E4F1', fg: '#4B3F7A', dot: '#4B3F7A', action: 'Confirmá la fecha' },
  { label: 'Trabajo programado', bg: '#E4EFE9', fg: '#164538', dot: '#1E5B4B' },
  { label: 'Pendiente de reseña', bg: '#9F5412', fg: '#FFFFFF', dot: '#C9711F', action: 'Dejá tu reseña' },
  { label: 'Cerrado', bg: '#F2EEE6', fg: '#3F4742', dot: '#8A918C' },
];

export const STAGE_STEP_LABELS = ['Enviada', 'Presupuestos', 'Elegido', 'Programado', 'Finalizado'];

export const REVIEW_TAGS = ['Puntual', 'Prolijo', 'Buen precio', 'Explicó todo', 'Lo recomiendo'];

export const RATING_LABELS = ['Tocá una estrella', 'Malo', 'Regular', 'Bueno', 'Muy bueno', 'Excelente'];

/**
 * MOCK de solicitudes. El servicio es la foto que guarda cada solicitud
 * (como la devolverá el backend); `id: null` porque los mocks no se atan a
 * UUIDs de producción.
 */
export const CLIENT_REQUESTS: ClientRequest[] = [
  {
    id: 'c1', title: 'Pérdida bajo mesada', service: { id: null, slug: 'plomeria', name: 'Plomería' },
    description: 'Tengo una pérdida abajo de la pileta de la cocina. Gotea desde ayer.', zone: 'Villa Italia', date: 'Hoy, 10:42',
    stage: 0, professionalIds: ['martin', 'luciano', 'marcelo'],
  },
  {
    id: 'c2', title: 'Saltan las térmicas', service: { id: null, slug: 'electricidad', name: 'Electricidad' },
    description: 'Cuando prendo el horno eléctrico salta la térmica de la cocina.', zone: 'Villa Italia', date: 'Ayer, 21:15',
    stage: 1, professionalIds: ['juan', 'carlos', 'nicolas'],
    quotes: [
      { professionalId: 'carlos', amount: 52000, slot: 'Hoy 16:00', description: 'Cambio de térmica y disyuntor diferencial. Garantía de 6 meses.' },
    ],
  },
  {
    id: 'c3', title: 'Pintar dormitorio', service: { id: null, slug: 'pintura', name: 'Pintura' },
    description: 'Quiero pintar un dormitorio de 3 x 4 m, paredes y techo.', zone: 'Villa Italia', date: '18 sep',
    stage: 2, professionalIds: ['laura'], chosenId: 'laura', amount: 210000,
  },
  {
    id: 'c4', title: 'Revisión de calefactor', service: { id: null, slug: 'gas', name: 'Gas' },
    description: 'El calefactor del living hace llama amarilla. Quiero que lo revisen.', zone: 'Villa Italia', date: '15 sep',
    stage: 3, professionalIds: ['hernan'], chosenId: 'hernan', amount: 35000, when: 'Vie 25 sep · 10:00',
  },
  {
    id: 'c5', title: 'Cambio de cerradura', service: { id: null, slug: 'cerrajeria', name: 'Cerrajería' },
    description: 'Quiero cambiar la cerradura de la puerta de entrada.', zone: 'Villa Italia', date: '12 sep',
    stage: 4, professionalIds: ['diego'], chosenId: 'diego', amount: 42000, when: 'Terminado el 20 sep',
  },
  {
    id: 'c6', title: 'Instalación de split', service: { id: null, slug: 'aire-acondicionado', name: 'Aire acondicionado' },
    description: 'Tengo un split de 3000 frigorías para instalar en el dormitorio.', zone: 'Villa Italia', date: '2 sep',
    stage: 5, professionalIds: ['pablo'], chosenId: 'pablo', amount: 95000, when: 'Terminado el 6 sep',
    myRating: 5, myReview: 'Rápido y prolijo. Dejó todo limpio.',
  },
];
