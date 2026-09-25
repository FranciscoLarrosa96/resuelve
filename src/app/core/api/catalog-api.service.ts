import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { Category, Service, Zone } from '../models/category';
import { API_URL } from './api.config';

/** Catálogo público del backend: GET /categories, GET /services y GET /zones. */
@Injectable({ providedIn: 'root' })
export class CatalogApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_URL);

  /** Categorías activas, cada una con sus servicios activos. */
  getCategories(): Observable<Category[]> {
    return this.http.get<Category[]>(`${this.baseUrl}/categories`);
  }

  /** Servicios activos. `category` (slug) filtra por categoría. */
  getServices(options: { category?: string } = {}): Observable<Service[]> {
    const params = options.category ? { category: options.category } : undefined;
    return this.http.get<Service[]>(`${this.baseUrl}/services`, { params });
  }

  /** Zonas (barrios) activas de una ciudad, en orden de presentación. */
  getZones(city = 'tandil'): Observable<Zone[]> {
    return this.http.get<Zone[]>(`${this.baseUrl}/zones`, { params: { city } });
  }
}
