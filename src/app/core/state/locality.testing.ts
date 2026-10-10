import { LocalityRef } from '../models/locality';
import { LOCALITY_STORAGE_KEY } from './locality.store';

/** Solo para tests: Tandil como ciudad elegida (lo que vería alguien que ya eligió su ciudad). */
export const TEST_LOCALITY: LocalityRef = {
  id: '99999999-9999-4999-8999-000000000001',
  name: 'Tandil',
  slug: 'tandil',
  province: { name: 'Buenos Aires', slug: 'buenos-aires' },
  label: 'Tandil, Buenos Aires',
  path: 'buenos-aires/tandil',
};

/** Deja elegida `TEST_LOCALITY` en este navegador ANTES de crear los stores. */
export function useTestLocality(locality: LocalityRef = TEST_LOCALITY): LocalityRef {
  localStorage.setItem(LOCALITY_STORAGE_KEY, JSON.stringify(locality));
  return locality;
}

/** URL de los barrios de la ciudad de test. */
export const testNeighborhoodsUrl = (api: string, locality: LocalityRef = TEST_LOCALITY) =>
  `${api}/localities/${locality.id}/neighborhoods`;
