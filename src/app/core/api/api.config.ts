import { InjectionToken } from '@angular/core';
import { environment } from '../../../environments/environment';

/** Base de la API REST (…/api/v1). Vacía = backend todavía no configurado. */
export const API_URL = new InjectionToken<string>('API_URL', {
  providedIn: 'root',
  factory: () => environment.apiUrl,
});
