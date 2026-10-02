import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ProfessionalsApiService } from '../api/professionals-api.service';
import { RetentionApiService } from '../api/retention-api.service';
import { RequestStore } from '../state/request.store';

export type RehireResult = 'started' | 'unavailable' | 'error';

/**
 * "Volver a contratar" desde cualquier pantalla que solo conoce el id del
 * profesional (reseña, trabajo realizado). Pide lo que tiene el cliente con
 * él y arma un pedido NUEVO dirigido (TARGETED): nunca vuelve a discovery.
 * Si hoy no recibe solicitudes, no abre nada y lo dice.
 */
@Injectable({ providedIn: 'root' })
export class RehireService {
  private readonly retention = inject(RetentionApiService);
  private readonly professionals = inject(ProfessionalsApiService);
  private readonly request = inject(RequestStore);
  private readonly router = inject(Router);

  readonly busy = signal(false);

  async start(professionalId: string): Promise<RehireResult> {
    if (this.busy()) return 'error';
    this.busy.set(true);
    try {
      const relationship = await firstValueFrom(this.retention.relationship(professionalId));
      if (!relationship.canRehire) return 'unavailable';
      const professional = await firstValueFrom(this.professionals.getProfessionalById(professionalId));
      this.request.startRehire(professional, relationship.rehireServiceId);
      await this.router.navigate(['/solicitud']);
      return 'started';
    } catch {
      return 'error';
    } finally {
      this.busy.set(false);
    }
  }
}
