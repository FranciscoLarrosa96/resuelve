import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AccountApiService, DeletionBlock } from '../../../core/api/account-api.service';
import { classifyError } from '../../../core/api/api-error';
import { AuthStore } from '../../../core/state/auth.store';
import { Dialog } from '../dialog/dialog';

export const DELETE_ACCOUNT_MESSAGES = {
  wrongPassword: 'La contraseña no es correcta.',
  blocked: 'Todavía no podés eliminar tu cuenta.',
  failed: 'No pudimos eliminar tu cuenta. Intentá nuevamente.',
  rateLimited: 'Hiciste muchos intentos seguidos. Esperá un minuto e intentá de nuevo.',
  checkFailed: 'No pudimos revisar si tu cuenta se puede eliminar. Intentá nuevamente.',
} as const;

/**
 * "Eliminar cuenta" (cliente y profesional). La baja es definitiva: el backend
 * anonimiza los datos personales y cierra lo que quedó abierto. Antes de pedir
 * la contraseña se consulta qué lo impide (trabajos en curso, suscripción PRO)
 * para decirlo con claridad en vez de fallar al final.
 */
@Component({
  selector: 'app-delete-account',
  imports: [Dialog],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section
      class="rounded-2xl border border-line bg-surface px-4 py-4"
      aria-labelledby="delete-account-title"
      data-testid="delete-account"
    >
      <h2 id="delete-account-title" class="text-sm font-semibold text-ink-soft">Eliminar cuenta</h2>
      <p class="mt-1 text-[14px] leading-[1.45] text-ink-soft">
        Borramos tus datos personales y cerramos tu cuenta. No se puede deshacer.
      </p>
      <button
        type="button"
        class="mt-2 min-h-11 rounded-lg text-[14.5px] font-semibold text-danger hover:underline"
        (click)="open()"
      >
        Eliminar mi cuenta
      </button>
    </section>

    <app-dialog
      [open]="isOpen()"
      labelledBy="delete-account-dialog-title"
      describedBy="delete-account-dialog-text"
      [dismissable]="!deleting()"
      (dismiss)="close()"
    >
      <h2 id="delete-account-dialog-title" class="font-sans text-[22px] font-bold tracking-[-0.02em]">
        Eliminar tu cuenta
      </h2>
      <div id="delete-account-dialog-text" class="mt-3 text-[14.5px] leading-[1.5] text-ink-soft">
        @if (checking()) {
          <p>Revisando tu cuenta…</p>
        } @else if (checkFailed()) {
          <p role="alert" class="font-semibold text-danger">{{ messages.checkFailed }}</p>
        } @else if (blockers().length) {
          <p class="font-semibold text-ink">{{ messages.blocked }}</p>
          <ul class="mt-2 list-disc space-y-1 pl-5" data-testid="delete-blockers">
            @for (b of blockers(); track b.code) {
              <li>{{ b.message }}</li>
            }
          </ul>
        } @else {
          <p>Si seguís:</p>
          <ul class="mt-2 list-disc space-y-1 pl-5">
            <li>Tu nombre, email, teléfono y foto se borran. Para el resto de las personas pasás a ser "Usuario eliminado".</li>
            <li>Si tenés un perfil profesional, deja de aparecer y se borran tus fotos y documentos de matrícula.</li>
            <li>Tus solicitudes abiertas se cancelan y se borran la dirección y las fotos.</li>
            <li>Los trabajos y reseñas que compartiste con otras personas se conservan, sin tus datos.</li>
            <li>No vas a poder volver a entrar con esta cuenta. Podés crear otra con el mismo email.</li>
          </ul>
          <label for="delete-account-password" class="mt-4 block text-[14px] font-semibold text-ink">
            Escribí tu contraseña para confirmar
          </label>
          <input
            id="delete-account-password"
            type="password"
            autocomplete="current-password"
            class="mt-1.5 h-12 w-full rounded-xl border border-line-btn bg-surface px-3.5 text-[15px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-primary"
            [value]="password()"
            [disabled]="deleting()"
            [attr.aria-invalid]="!!error()"
            [attr.aria-describedby]="error() ? 'delete-account-error' : null"
            (input)="onPassword($event)"
            (keydown.enter)="confirm()"
          />
          @if (error(); as e) {
            <p id="delete-account-error" role="alert" class="mt-2 text-[14px] font-semibold text-danger">{{ e }}</p>
          }
        }
      </div>
      <div class="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          class="h-12 rounded-xl px-4 text-[15px] font-semibold text-ink-soft hover:bg-sand disabled:opacity-55"
          [disabled]="deleting()"
          (click)="close()"
        >
          {{ blockers().length ? 'Entendido' : 'Volver' }}
        </button>
        @if (!checking() && !checkFailed() && !blockers().length) {
          <button
            type="button"
            class="flex h-12 items-center justify-center gap-2 rounded-xl bg-danger-fill px-5 text-[15px] font-semibold text-white disabled:opacity-70 press"
            [disabled]="deleting() || !password()"
            [attr.aria-busy]="deleting()"
            (click)="confirm()"
          >
            @if (deleting()) {
              <span class="size-4 animate-spin rounded-full border-[2.5px] border-white/35 border-t-white" aria-hidden="true"></span>
            }
            Eliminar mi cuenta
          </button>
        }
      </div>
    </app-dialog>
  `,
})
export class DeleteAccount {
  private readonly api = inject(AccountApiService);
  private readonly auth = inject(AuthStore);

  protected readonly messages = DELETE_ACCOUNT_MESSAGES;
  protected readonly isOpen = signal(false);
  protected readonly checking = signal(false);
  protected readonly checkFailed = signal(false);
  protected readonly blockers = signal<DeletionBlock[]>([]);
  protected readonly password = signal('');
  protected readonly error = signal<string | null>(null);
  protected readonly deleting = signal(false);

  protected async open(): Promise<void> {
    this.isOpen.set(true);
    this.password.set('');
    this.error.set(null);
    await this.refreshCheck();
  }

  protected close(): void {
    if (this.deleting()) return;
    this.isOpen.set(false);
    this.password.set('');
    this.error.set(null);
  }

  protected onPassword(event: Event): void {
    this.password.set((event.target as HTMLInputElement).value);
    this.error.set(null);
  }

  protected async confirm(): Promise<void> {
    if (this.deleting() || !this.password()) return;
    this.deleting.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.api.deleteAccount(this.password()));
      this.isOpen.set(false);
      this.auth.accountDeleted();
    } catch (error) {
      const e = classifyError(error);
      if (e.code === 'ACCOUNT_PASSWORD_INCORRECT') {
        this.error.set(DELETE_ACCOUNT_MESSAGES.wrongPassword);
      } else if (e.code === 'ACCOUNT_DELETE_BLOCKED') {
        await this.refreshCheck();
      } else {
        this.error.set(e.kind === 'rate-limited' ? DELETE_ACCOUNT_MESSAGES.rateLimited : DELETE_ACCOUNT_MESSAGES.failed);
      }
    } finally {
      this.deleting.set(false);
    }
  }

  private async refreshCheck(): Promise<void> {
    this.checking.set(true);
    this.checkFailed.set(false);
    try {
      this.blockers.set((await firstValueFrom(this.api.deletionCheck())).blockers);
    } catch {
      this.blockers.set([]);
      this.checkFailed.set(true);
    } finally {
      this.checking.set(false);
    }
  }
}
