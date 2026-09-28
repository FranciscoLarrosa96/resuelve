import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { BackNavigation } from './core/services/back-navigation.service';
import { CurrentRoute } from './core/services/current-route.service';
import { AuthStore } from './core/state/auth.store';
import { CatalogStore } from './core/state/catalog.store';
import { NotificationsStore } from './core/state/notifications.store';
import { ThemeStore } from './core/state/theme.store';
import { PwaInstall } from './core/pwa/pwa-install.service';
import { PwaUpdate } from './core/pwa/pwa-update.service';
import { PwaPrompts } from './shared/components/pwa-prompts/pwa-prompts';
import { Toast } from './shared/components/toast/toast';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Toast, PwaPrompts],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <router-outlet />
    <app-toast />
    <!-- Avisos de la PWA (sin conexión, nueva versión, instalar): fuera del bundle inicial. -->
    @defer (on idle) {
      <app-pwa-prompts />
    }
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
    // Tema (Claro / Oscuro / Sistema): sigue al sistema operativo en modo "Sistema".
    inject(ThemeStore);
    // PWA: captura `beforeinstallprompt` desde el arranque (el prompt nativo nunca se muestra solo).
    inject(PwaInstall);
    // Nueva versión: se escucha desde el arranque; el aviso lo muestra <app-pwa-prompts />.
    inject(PwaUpdate);
  }
}
