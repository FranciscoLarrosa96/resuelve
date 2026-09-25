/**
 * Contratos de la API (subset). Espejo de las respuestas del backend
 * (ver los archivos *.presenter.ts del backend). Los montos llegan como string "52000.00".
 */

export interface ApiError {
  statusCode: number;
  code: string;
  message: string;
  details?: unknown;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
}

export interface ApiService {
  id: string;
  name: string;
  slug: string;
  categoryId: string;
  requiresLicense: boolean;
}

export interface ApiCategory {
  id: string;
  name: string;
  slug: string;
  services: ApiService[];
}

export interface ApiZone {
  id: string;
  name: string;
  slug: string;
  cityId: string;
}

export interface ApiProfessional {
  id: string;
  firstName: string;
  lastName: string;
  displayName: string;
  avatarUrl: string | null;
  headline: string | null;
  bio: string | null;
  yearsExperience: number;
  availableToday: boolean;
  averageResponseMinutes: number | null;
  averageRating: number;
  reviewsCount: number;
  completedJobsCount: number;
  services: { id: string; name: string; slug: string }[];
  zones: { id: string; name: string; slug: string }[];
  verifications: { identity: boolean; phone: boolean; license: boolean };
}

export interface ProfessionalSearch {
  service?: string;
  zone?: string;
  availableToday?: boolean;
  licenseVerified?: boolean;
  minRating?: number;
  page?: number;
  pageSize?: number;
}
