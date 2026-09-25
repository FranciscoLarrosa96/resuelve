import { Injectable, inject, signal } from '@angular/core';
import { ActivatedRouteSnapshot, Data, NavigationEnd, Router } from '@angular/router';

/** URL y `data` de la ruta activa como signals (para navs y shells). */
@Injectable({ providedIn: 'root' })
export class CurrentRoute {
  private readonly router = inject(Router);

  readonly url = signal(this.router.url);
  readonly data = signal<Data>({});

  constructor() {
    this.router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
        this.url.set(event.urlAfterRedirects);
        this.data.set(this.deepestData(this.router.routerState.snapshot.root));
      }
    });
  }

  /** true si la URL actual (sin query) empieza con alguno de los prefijos. */
  matches(...prefixes: string[]): boolean {
    const path = this.url().split(/[?#]/)[0];
    return prefixes.some((p) => (p === '/' ? path === '/' : path === p || path.startsWith(p + '/')));
  }

  private deepestData(route: ActivatedRouteSnapshot): Data {
    let current = route;
    let data: Data = { ...current.data };
    while (current.firstChild) {
      current = current.firstChild;
      data = { ...data, ...current.data };
    }
    return data;
  }
}
