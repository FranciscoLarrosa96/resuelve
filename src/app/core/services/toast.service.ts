import { Injectable, signal } from '@angular/core';

/** Mensajes breves de confirmación (el toast oscuro del prototipo). */
@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly message = signal<string | null>(null);
  /** 'success' muestra el tilde; 'info' un ícono neutro (p. ej. sesión vencida). */
  readonly kind = signal<'success' | 'info'>('success');
  private timer?: ReturnType<typeof setTimeout>;

  show(message: string, duration = 2800, kind: 'success' | 'info' = 'success'): void {
    clearTimeout(this.timer);
    this.kind.set(kind);
    this.message.set(message);
    this.timer = setTimeout(() => this.message.set(null), duration);
  }
}
