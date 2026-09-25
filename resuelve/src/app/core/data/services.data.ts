import { CategoryName, Service, ServiceCategoryName } from '../models/category';

export const SERVICES: Service[] = [
  { id: 'Electricidad', category: 'Hogar y reparaciones', requiresLicense: true },
  { id: 'Gas', category: 'Hogar y reparaciones', requiresLicense: true },
  { id: 'Plomería', category: 'Hogar y reparaciones', requiresLicense: false },
  { id: 'Cerrajería', category: 'Hogar y reparaciones', requiresLicense: false },
  { id: 'Aire acondicionado', category: 'Hogar y reparaciones', requiresLicense: false },
  { id: 'Pintura', category: 'Hogar y reparaciones', requiresLicense: false },
  { id: 'Albañilería', category: 'Hogar y reparaciones', requiresLicense: false },
  { id: 'Destapaciones', category: 'Hogar y reparaciones', requiresLicense: false },
  { id: 'Limpieza', category: 'Hogar y reparaciones', requiresLicense: false },
  { id: 'Carpintería', category: 'Hogar y reparaciones', requiresLicense: false },
  { id: 'Herrería', category: 'Hogar y reparaciones', requiresLicense: false },
  { id: 'Corte de pasto', category: 'Exterior', requiresLicense: false },
  { id: 'Jardinería', category: 'Exterior', requiresLicense: false, relatedSearch: ['pasto'] },
  { id: 'Poda', category: 'Exterior', requiresLicense: false },
  { id: 'Fletes', category: 'Transporte', requiresLicense: false },
  { id: 'Mudanzas', category: 'Transporte', requiresLicense: false, relatedSearch: ['flete'] },
  { id: 'Retiro de muebles', category: 'Transporte', requiresLicense: false },
  { id: 'Reparación de PC', category: 'Tecnología', requiresLicense: false },
  { id: 'Cámaras', category: 'Tecnología', requiresLicense: false },
];

export const SERVICE_CATEGORIES: ServiceCategoryName[] = ['Hogar y reparaciones', 'Exterior', 'Transporte', 'Tecnología'];

export function serviceRequiresLicense(id: CategoryName): boolean {
  return SERVICES.find((service) => service.id === id)?.requiresLicense ?? false;
}

export function findServices(query: string): Service[] {
  const normalized = query.trim().toLocaleLowerCase('es');
  return SERVICES.filter((service) =>
    !normalized || [service.id, service.category, ...(service.relatedSearch ?? [])]
      .some((text) => text.toLocaleLowerCase('es').includes(normalized)),
  );
}
