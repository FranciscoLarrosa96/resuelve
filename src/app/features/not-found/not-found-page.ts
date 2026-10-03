import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/** Ruta inexistente: nunca una pantalla en blanco ni un redirect silencioso al inicio. Sale con noindex (PageSeo). */
@Component({
  selector: 'app-not-found-page',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="mx-auto max-w-160 px-5 py-16 text-center lg:py-24">
      <p class="text-[13px] font-semibold tracking-[0.12em] text-brand uppercase">Error 404</p>
      <h1 class="mt-3 font-display text-[32px] leading-[1.1] font-bold tracking-[-0.02em] lg:text-[40px]">
        Esta página no existe
      </h1>
      <p class="mt-3 text-[16.5px] leading-[1.45] text-muted">
        Puede que el enlace esté mal escrito o que ya no esté disponible. Volvé al inicio y contanos qué
        necesitás resolver.
      </p>
      <div class="mt-8 flex flex-wrap justify-center gap-3">
        <a
          routerLink="/"
          class="button-primary flex h-13 items-center rounded-xl px-5.5 text-[15.5px] font-semibold"
          >Volver al inicio</a
        >
        <a
          routerLink="/servicios"
          class="button-secondary press flex h-13 items-center rounded-xl px-5 text-[15.5px] font-semibold text-ink"
          >Ver los servicios</a
        >
      </div>
    </main>
  `,
})
export class NotFoundPage {}
