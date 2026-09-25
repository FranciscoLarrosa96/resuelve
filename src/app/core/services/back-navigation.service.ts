import { Injectable, inject } from '@angular/core';
import { Location } from '@angular/common';
import { NavigationEnd, Router } from '@angular/router';

/**
 * "Volver" dentro de la app: usa el historial si la navegación empezó acá,
 * y si no (entrada directa por URL) va a una ruta de respaldo.
 */
@Injectable({ providedIn: 'root' })
export class BackNavigation {
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private navigations = 0;

  constructor() {
    this.router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) this.navigations++;
    });
  }

  back(fallback: string | unknown[] = '/'): void {
    if (this.navigations > 1) {
      this.location.back();
    } else {
      this.router.navigate(Array.isArray(fallback) ? fallback : [fallback]);
    }
  }
}
