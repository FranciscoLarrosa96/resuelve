import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { GoogleSignIn } from '../../../core/auth/google-sign-in';

/**
 * Botón oficial «Continuar con Google» con un «o» debajo. No aparece si el backend no
 * tiene Google habilitado o si el script de Google no carga (bloqueadores, sin conexión).
 */
@Component({
  selector: 'app-google-button',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div [hidden]="!shown()" data-testid="google-button">
      <div #slot class="flex min-h-11 w-full justify-center"></div>
      @if (divider()) {
        <div class="mt-4 flex items-center gap-3 text-[14px] text-muted" aria-hidden="true">
          <span class="h-px flex-1 bg-line"></span>{{ dividerText() }}<span class="h-px flex-1 bg-line"></span>
        </div>
      }
    </div>
  `,
})
export class GoogleButton {
  private readonly google = inject(GoogleSignIn);
  readonly text = input<'continue_with' | 'signup_with' | 'signin_with'>('continue_with');
  readonly divider = input(true);
  readonly dividerText = input('o con tu email');
  /** ID token de Google: quien lo recibe lo manda al backend. */
  readonly credential = output<string>();
  protected readonly shown = signal(false);
  private readonly slot = viewChild.required<ElementRef<HTMLElement>>('slot');

  constructor() {
    afterNextRender(() => {
      void this.google
        .render(this.slot().nativeElement, this.text(), (c) => this.credential.emit(c))
        .then((ok) => this.shown.set(ok));
    });
  }
}
