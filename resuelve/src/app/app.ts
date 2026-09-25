import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { BackNavigation } from './core/services/back-navigation.service';
import { CurrentRoute } from './core/services/current-route.service';
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
  }
}
