export type CategoryName =
  | 'Electricidad'
  | 'Gas'
  | 'Plomería'
  | 'Cerrajería'
  | 'Aire acondicionado'
  | 'Pintura'
  | 'Albañilería'
  | 'Destapaciones';

export interface Category {
  name: CategoryName;
  /** Texto de apoyo, ej. "38 profesionales" */
  count: string;
  /** Subcategoría que se asume al elegir la categoría directamente. */
  defaultProblem: string;
}
