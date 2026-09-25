import { Injectable, signal } from '@angular/core';

/** Mensajes breves de confirmación (el toast oscuro del prototipo). */
@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly message = signal<string | null>(null);
  private timer?: ReturnType<typeof setTimeout>;

  show(message: string, duration = 2800): void {
    clearTimeout(this.timer);
    this.message.set(message);
    this.timer = setTimeout(() => this.message.set(null), duration);
  }
}
