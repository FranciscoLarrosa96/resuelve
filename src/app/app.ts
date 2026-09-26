import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { BackNavigation } from './core/services/back-navigation.service';
import { CurrentRoute } from './core/services/current-route.service';
import { AuthStore } from './core/state/auth.store';
import { CatalogStore } from './core/state/catalog.store';
import { NotificationsStore } from './core/state/notifications.store';
import { Toast } from './shared/components/toast/toast';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Toast],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <router-outlet />
    <app-toast />
  `,
})
export class App {
  constructor() {
    // Se instancian temprano para registrar todas las navegaciones.
    inject(BackNavigation);
    inject(CurrentRoute);
    // Catálogo real: una carga por sesión (en el prerender no pide nada).
    inject(CatalogStore).loadCatalog();
    // Restaura la sesión desde sessionStorage (solo en el navegador).
    inject(AuthStore).initialize();
    // Novedades in-app: se consultan solas mientras haya sesión.
    inject(NotificationsStore).connect();
  }
}
