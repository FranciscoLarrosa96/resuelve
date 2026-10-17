import { Injectable } from '@angular/core';

/**
 * Permiso de un solo uso para ver `/pro/bienvenida` justo al terminar el alta. Vive en memoria: recargar
 * la página (o entrar a mano a la URL) no lo tiene y lleva al Inicio, así la bienvenida no se repite con F5.
 */
@Injectable({ providedIn: 'root' })
export class WelcomeTicket {
  private granted = false;

  grant(): void {
    this.granted = true;
  }

  /** true una sola vez después de `grant()`. */
  consume(): boolean {
    const granted = this.granted;
    this.granted = false;
    return granted;
  }
}
