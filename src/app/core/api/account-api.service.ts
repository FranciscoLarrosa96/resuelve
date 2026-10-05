import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_URL } from './api.config';

export interface DeletionBlock {
  code: 'ACTIVE_JOBS' | 'OPEN_SUBSCRIPTION';
  count: number;
  message: string;
}

export interface DeletionCheck {
  canDelete: boolean;
  blockers: DeletionBlock[];
}

/** Baja de cuenta (AccountController). Irreversible: el backend anonimiza los datos. */
@Injectable({ providedIn: 'root' })
export class AccountApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_URL);

  deletionCheck(): Observable<DeletionCheck> {
    return this.http.get<DeletionCheck>(`${this.baseUrl}/account/deletion-check`);
  }

  /** Confirma con la contraseña actual. 403 ACCOUNT_PASSWORD_INCORRECT · 409 ACCOUNT_DELETE_BLOCKED. */
  deleteAccount(password: string): Observable<{ deleted: true }> {
    return this.http.post<{ deleted: true }>(`${this.baseUrl}/account/delete`, { password });
  }
}
