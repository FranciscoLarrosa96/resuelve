import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * Lugar reservado de las pantallas personales mientras se restaura la
 * sesión (y en el HTML prerenderizado, que nunca tiene datos del usuario).
 */
@Component({
  selector: 'app-session-pending',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto flex max-w-md flex-col items-center gap-3 px-5 pt-24 pb-24 text-center" role="status">
      <span class="size-7 animate-spin rounded-full border-[3px] border-brand/25 border-t-brand" aria-hidden="true"></span>
      <p class="text-sm text-muted">Cargando tu sesión…</p>
    </div>
  `,
})
export class SessionPending {}
