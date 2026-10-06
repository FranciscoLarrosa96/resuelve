import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { classifyError } from '../../core/api/api-error';
import { NotificationsApiService } from '../../core/api/notifications-api.service';
import { SUBMIT_CLASS } from './auth-form';

export const UNSUBSCRIBE_MESSAGES = {
  invalid: 'Este enlace no es válido o está incompleto. Podés apagar los avisos desde Mi perfil.',
  rateLimited: 'Hiciste muchos intentos seguidos. Esperá un minuto e intentá de nuevo.',
  failed: 'No pudimos procesar la baja. Intentá nuevamente.',
} as const;

/**
 * Enlace de baja de los emails (`/avisos/baja?t=…`). No necesita sesión. No da
 * de baja al abrir la página (los lectores de correo precargan enlaces): hay
 * que tocar el botón.
 */
@Component({
  selector: 'app-email-unsubscribe-page',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-md animate-fade-in px-5 pt-8 pb-20 lg:pt-16">
      @if (done()) {
        <h1 class="font-display text-3xl font-bold tracking-[-0.02em]">Listo, no te escribimos más</h1>
        <p class="mt-2 text-muted" role="status">
          Dejaste de recibir avisos por email. Las novedades siguen apareciendo dentro de Resuelve, y podés volver a
          activarlos cuando quieras desde Mi perfil.
        </p>
        <a routerLink="/" [class]="submitClass + ' mt-6 inline-flex'">Ir a Resuelve</a>
      } @else {
        <h1 class="font-display text-3xl font-bold tracking-[-0.02em]">Avisos por email</h1>
        <p class="mt-2 text-muted">
          ¿Querés dejar de recibir los avisos de actividad de Resuelve en tu email? Las novedades van a seguir
          apareciendo dentro de la app.
        </p>
        @if (error(); as msg) {
          <p role="alert" class="mt-4 rounded-xl bg-danger-soft px-3.5 py-3 text-sm font-medium text-danger">{{ msg }}</p>
        }
        @if (token()) {
          <button type="button" [class]="submitClass + ' mt-6'" [disabled]="saving()" [attr.aria-busy]="saving()" (click)="unsubscribe()">
            @if (saving()) {
              <span class="size-4.5 animate-spin rounded-full border-[2.5px] border-white/35 border-t-white" aria-hidden="true"></span>
            }
            Dejar de recibir avisos
          </button>
        } @else {
          <p role="alert" class="mt-4 rounded-xl bg-danger-soft px-3.5 py-3 text-sm font-medium text-danger">
            {{ messages.invalid }}
          </p>
        }
        <a routerLink="/perfil" class="mt-5 inline-flex min-h-11 items-center text-[14.5px] font-semibold text-brand hover:underline">
          Ir a Mi perfil
        </a>
      }
    </div>
  `,
})
export class EmailUnsubscribePage {
  private readonly api = inject(NotificationsApiService);
  protected readonly messages = UNSUBSCRIBE_MESSAGES;
  protected readonly submitClass = SUBMIT_CLASS;
  protected readonly token = signal(inject(ActivatedRoute).snapshot.queryParamMap.get('t'));
  protected readonly saving = signal(false);
  protected readonly done = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async unsubscribe(): Promise<void> {
    const token = this.token();
    if (!token || this.saving()) return;
    this.saving.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.api.unsubscribeEmail(token));
      this.done.set(true);
    } catch (e) {
      const { kind, code } = classifyError(e);
      this.error.set(
        code === 'INVALID_UNSUBSCRIBE_TOKEN'
          ? UNSUBSCRIBE_MESSAGES.invalid
          : kind === 'rate-limited'
            ? UNSUBSCRIBE_MESSAGES.rateLimited
            : UNSUBSCRIBE_MESSAGES.failed,
      );
    } finally {
      this.saving.set(false);
    }
  }
}
