import { Injectable, signal } from '@angular/core';

/** Enlace opcional dentro del toast ("Ver"). */
export interface ToastAction {
  label: string;
  link: readonly (string | number)[];
}

/** Mensajes breves de confirmación (el toast oscuro del prototipo). */
@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly message = signal<string | null>(null);
  /** 'success' muestra el tilde; 'info' un ícono neutro (p. ej. sesión vencida). */
  readonly kind = signal<'success' | 'info'>('success');
  readonly action = signal<ToastAction | null>(null);
  private timer?: ReturnType<typeof setTimeout>;

  show(message: string, duration = 2800, kind: 'success' | 'info' = 'success', action: ToastAction | null = null): void {
    clearTimeout(this.timer);
    this.kind.set(kind);
    this.action.set(action);
    this.message.set(message);
    this.timer = setTimeout(() => this.dismiss(), duration);
  }

  dismiss(): void {
    clearTimeout(this.timer);
    this.message.set(null);
    this.action.set(null);
  }
}
