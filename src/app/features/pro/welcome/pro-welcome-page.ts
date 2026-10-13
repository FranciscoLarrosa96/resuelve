import { afterNextRender, ChangeDetectionStrategy, Component, ElementRef, Injector, PLATFORM_ID, computed, effect, inject, signal, untracked } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ProStore } from '../../../core/state/pro.store';
import { Icon } from '../../../shared/components/icon/icon';
import { ProfileShare } from '../../../shared/components/profile-share/profile-share';
import { AvatarEditor } from '../profile/avatar-editor';
import {
  contactReadyText,
  hasDirectContact,
  licensesToSend,
  localitiesText,
  profileVisibility,
  visibilityGaps,
} from '../activation';

/**
 * Bienvenida al terminar el alta profesional, ya en el área profesional (el
 * cambio de modo marca "Profesional" porque el modo sale de la ruta). Se llega
 * UNA vez, desde el alta (`welcomeGuard`); entrar a mano a la URL lleva al Inicio. Todo sale de
 * /pro/me: no dice "publicado" si el perfil no puede aparecer en búsquedas.
 * Compartir es la acción principal, nunca obligatoria; la matrícula es opcional.
 */
@Component({
  selector: 'app-pro-welcome-page',
  imports: [RouterLink, Icon, ProfileShare, AvatarEditor],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto w-full max-w-2xl px-4 pt-8 pb-16 md:px-6 lg:mx-0 lg:px-0 lg:pt-6">
      @if (store.ownProfile(); as me) {
        <section class="animate-fade-in" aria-labelledby="welcome-title" data-testid="pro-welcome">
          @switch (visibility()) {
            @case ('VISIBLE') {
              <p class="inline-flex items-center gap-1.5 text-sm font-semibold text-success-strong">
                <app-icon name="check-circle" [size]="16" />Perfil publicado
              </p>
              <h1
                id="welcome-title"
                tabindex="-1"
                class="mt-3 font-display text-[32px] leading-[1.12] font-bold tracking-[-0.02em] text-balance md:text-[40px]"
              >
                ¡Ya tenés tu espacio en Resuelve! 🎉
              </h1>
              <p class="mt-4 text-[17px] leading-relaxed text-ink-soft">
                Tu perfil ya está publicado y puede aparecer cuando buscan profesionales
                {{ localities() ? 'en ' + localities() : 'en las localidades donde trabajás' }}.
              </p>
              <p class="mt-2 text-[17px] leading-relaxed text-ink-soft">
                Ahora podés compartirlo con tus clientes, mostrar tus trabajos y empezar a construir tu
                presencia profesional.
              </p>
            }
            @case ('PAUSED') {
              <h1 id="welcome-title" tabindex="-1" class="font-display text-[32px] leading-[1.12] font-bold tracking-[-0.02em] md:text-[40px]">
                Tu perfil profesional está creado
              </h1>
              <p class="mt-4 text-[17px] leading-relaxed text-ink-soft">
                Está pausado: no aparece en búsquedas nuevas. Reactivalo desde Mi perfil cuando quieras.
              </p>
            }
            @default {
              <h1 id="welcome-title" tabindex="-1" class="font-display text-[32px] leading-[1.12] font-bold tracking-[-0.02em] md:text-[40px]">
                Tu perfil profesional está creado
              </h1>
              <p class="mt-4 text-[17px] leading-relaxed text-ink-soft" data-testid="welcome-gaps">
                Para aparecer en búsquedas te falta {{ gaps().join(' y ') }}.
                <a routerLink="/pro/perfil" class="font-semibold text-brand underline underline-offset-2">Completalo en Mi perfil</a>.
              </p>
            }
          }

          @if (visibility() === 'VISIBLE') {
            <p class="mt-5 text-[15px] leading-relaxed text-ink" data-testid="welcome-contact">
              {{ contactText() }}
              @if (!direct()) {
                <span class="text-muted">
                  Cuando quieras, sumá WhatsApp o llamadas desde
                  <a routerLink="/pro/perfil" [queryParams]="{ editar: 'contact' }" class="font-semibold text-brand underline underline-offset-2"
                    >Mi perfil → Cómo te contactan</a
                  >.
                </span>
              }
            </p>
            @if (askPhoto()) {
              <!-- Antes de compartir: una foto propia hace que el perfil se vea completo. Opcional. -->
              <div
                class="mt-7 flex items-center gap-4 rounded-2xl border border-line-soft bg-surface p-4"
                data-testid="welcome-avatar"
              >
                <app-avatar-editor class="shrink-0" [compact]="true" />
                <div class="min-w-0">
                  @if (me.avatarUrl) {
                    <p class="text-[15.5px] font-bold text-success-strong">¡Listo, ya se ve tu foto!</p>
                    <p class="mt-0.5 text-[14px] leading-5 text-ink-soft">Tu perfil está listo para compartir.</p>
                  } @else {
                    <p class="text-[15.5px] font-bold">Antes de compartir, sumá tu foto</p>
                    <p class="mt-0.5 text-[14px] leading-5 text-ink-soft">
                      Una foto tuya ayuda a que te reconozcan. Es opcional: tocá la cámara.
                    </p>
                  }
                </div>
              </div>
            }
            <app-profile-share
              class="mt-8"
              [profile]="me"
              [own]="true"
              [primary]="true"
              [withCopy]="true"
              label="Compartir mi perfil"
            />
          }

          <div class="mt-4 flex flex-col gap-2.5 sm:flex-row" data-testid="welcome-actions">
            <a
              routerLink="/pro/dashboard"
              class="inline-flex min-h-12 items-center justify-center gap-1.5 rounded-xl px-6 text-[15px] font-semibold"
              [class]="visibility() === 'VISIBLE' ? 'button-secondary' : 'button-primary'"
              >Ir al panel profesional<app-icon name="arrow-right" [size]="15" [stroke]="2.4"
            /></a>
            @if (me.status === 'ACTIVE') {
              <a
                [routerLink]="me.slug ? ['/p', me.slug] : ['/profesional', me.id]"
                class="inline-flex min-h-12 items-center justify-center rounded-xl px-5 text-[15px] font-semibold text-brand hover:bg-brand-tint"
                >Ver mi perfil público</a
              >
            }
          </div>

          @if (licenses().length) {
            <!-- Opcional: no frena nada. El sello aparece solo cuando se verifica el número. -->
            <div class="mt-9 flex flex-col gap-3 border-t border-line-soft pt-6 sm:flex-row sm:items-center" data-testid="welcome-license">
              <p class="min-w-0 flex-1 text-[14.5px] leading-relaxed text-ink-soft">
                <strong class="font-semibold text-ink">Matrícula (opcional).</strong>
                En {{ licenseNames() }} ya aparecés sin enviarla. Si la enviás y la verificamos, tu perfil muestra
                «Matrícula verificada».
              </p>
              <a
                routerLink="/pro/perfil"
                [queryParams]="{ editar: 'licenses' }"
                class="button-secondary inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl px-4 text-[14.5px] font-semibold"
                >Enviar mi matrícula</a
              >
            </div>
          }
        </section>
      } @else if (store.ownProfileError()) {
        <section aria-labelledby="welcome-title">
          <h1 id="welcome-title" class="font-display text-[32px] leading-tight font-bold">Tu perfil profesional está creado</h1>
          <p class="mt-3 text-ink-soft" role="alert">No pudimos cargar tu perfil.</p>
          <div class="mt-6 flex flex-col gap-2.5 sm:flex-row">
            <button type="button" class="button-secondary min-h-12 rounded-xl px-5 font-semibold" (click)="store.refreshProfile()">Reintentar</button>
            <a routerLink="/pro/dashboard" class="button-primary inline-flex min-h-12 items-center justify-center rounded-xl px-6 font-semibold">Ir al panel profesional</a>
          </div>
        </section>
      } @else {
        <div class="grid gap-3" aria-hidden="true">
          <div class="shimmer h-9 w-3/4 rounded-md"></div>
          <div class="shimmer h-5 w-full rounded-md"></div>
          <div class="shimmer h-5 w-2/3 rounded-md"></div>
        </div>
        <span class="sr-only" role="status">Cargando tu perfil…</span>
      }
    </div>
  `,
})
export class ProWelcomePage {
  protected readonly store = inject(ProStore);
  private readonly me = computed(() => this.store.ownProfile());
  protected readonly visibility = computed(() => {
    const me = this.me();
    return me ? profileVisibility(me) : null;
  });
  protected readonly gaps = computed(() => {
    const me = this.me();
    return me ? visibilityGaps(me) : [];
  });
  protected readonly localities = computed(() => {
    const me = this.me();
    return me ? localitiesText(me) : '';
  });
  protected readonly contactText = computed(() => {
    const me = this.me();
    return me ? contactReadyText(me) : '';
  });
  protected readonly direct = computed(() => {
    const me = this.me();
    return !!me && hasDirectContact(me);
  });
  protected readonly licenses = computed(() => {
    const me = this.me();
    return me ? licensesToSend(me) : [];
  });
  /** Llegó sin foto: el pedido de foto queda a la vista (también después de subirla, para confirmar). */
  protected readonly askPhoto = signal(false);
  protected readonly licenseNames = computed(() => this.licenses().map((s) => s.name).join(' y '));

  constructor() {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    const host = inject<ElementRef<HTMLElement>>(ElementRef);
    // Foco en el título cuando el perfil ya está en pantalla (una vez).
    const injector = inject(Injector);
    let focused = false;
    effect(() => {
      const me = this.me();
      if (focused || !me) return;
      focused = true;
      if (!me.avatarUrl) untracked(() => this.askPhoto.set(true));
      untracked(() =>
        afterNextRender(() => host.nativeElement.querySelector<HTMLElement>('#welcome-title')?.focus(), { injector }),
      );
    });
  }
}
