export type CategoryName =
  | 'Electricidad'
  | 'Gas'
  | 'Plomería'
  | 'Cerrajería'
  | 'Aire acondicionado'
  | 'Pintura'
  | 'Albañilería'
  | 'Destapaciones'
  | 'Fletes' | 'Mudanzas' | 'Retiro de muebles'
  | 'Corte de pasto' | 'Jardinería' | 'Poda' | 'Limpieza'
  | 'Reparación de PC' | 'Cámaras' | 'Carpintería' | 'Herrería';

export type ServiceCategoryName = 'Hogar y reparaciones' | 'Exterior' | 'Transporte' | 'Tecnología';

export interface Service {
  id: CategoryName;
  category: ServiceCategoryName;
  requiresLicense: boolean;
  relatedSearch?: string[];
}

export interface Category {
  name: CategoryName;
  /** Texto de apoyo, ej. "38 profesionales" */
  count: string;
  /** Subcategoría que se asume al elegir la categoría directamente. */
  defaultProblem: string;
}
