import { afterNextRender, ChangeDetectionStrategy, Component, ElementRef, Injector, PLATFORM_ID, computed, effect, inject, signal, untracked } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { AuthStore } from '../../../core/state/auth.store';
import { ProStore } from '../../../core/state/pro.store';
import { WorkPhotosStore } from '../../../core/state/work-photos.store';
import { Icon } from '../../../shared/components/icon/icon';
import { ProfileShare } from '../../../shared/components/profile-share/profile-share';
import { Avatar } from '../../../shared/components/avatar/avatar';
import { avatarOf } from '../../../core/models/avatar';
import { ActivationSession } from '../activation-session';
import { ActivationTipContent } from '../activation-tip';
import {
  ActivationTip,
  activationTips,
  contactReadyText,
  hasDirectContact,
  licensesToSend,
  localitiesText,
  profileVisibility,
  serviceGap,
  visibilityGaps,
} from '../activation';

/**
 * Bienvenida al terminar el alta profesional, ya en el área profesional (el
 * cambio de modo marca "Profesional" porque el modo sale de la ruta). Se llega
 * UNA vez, desde el alta (`welcomeGuard`); entrar a mano a la URL lleva al Inicio. Todo sale de
 * /pro/me: no dice "publicado" si el perfil no puede aparecer en búsquedas.
 * Breve: confirma el estado y propone UN próximo paso, el primero de `activationTips` (la misma secuencia del
 * Inicio; compartir queda al final y nunca aparece sin publicar). Todo es opcional; la matrícula también.
 */
@Component({
  selector: 'app-pro-welcome-page',
  imports: [RouterLink, Icon, ActivationTipContent, ProfileShare, Avatar],
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
              @if (pendingOffer(); as pending) {
                <p class="mt-4 text-[17px] leading-relaxed text-ink-soft" data-testid="welcome-pending">
                  Todavía <strong class="font-semibold text-ink">no está publicado</strong>: estamos revisando {{ pending }}.
                  Hasta que lo aprobemos no aparecés en las búsquedas ni recibís solicitudes de ese oficio.
                </p>
                <p class="mt-2 text-[17px] leading-relaxed text-ink-soft">
                  Te avisamos dentro de la app apenas lo resolvamos. Si lo aprobamos, se suma a tu perfil sin que cargues nada de nuevo; se publica cuando el perfil cumple las demás condiciones (estar activo y tener dónde trabajás cargado).
                </p>
              } @else {
              <p class="mt-4 text-[17px] leading-relaxed text-ink-soft" data-testid="welcome-gaps">
                Para aparecer en búsquedas te falta {{ gaps().join(' y ') }}.
                <a routerLink="/pro/perfil" class="font-semibold text-brand underline underline-offset-2">Completalo en Mi perfil</a>.
              </p>
              }
            }
          }

          @if (visibility() === 'VISIBLE') {
            <p class="mt-5 text-[15px] leading-relaxed text-ink" data-testid="welcome-contact">
              {{ contactText() }}
              @if (!direct() && step() !== 'CONTACT') {
                <span class="text-muted">
                  Cuando quieras, sumá WhatsApp o llamadas desde
                  <a routerLink="/pro/perfil" [queryParams]="{ editar: 'contact' }" class="font-semibold text-brand underline underline-offset-2"
                    >Mi perfil → Cómo te contactan</a
                  >.
                </span>
              }
            </p>
            @if (step(); as tip) {
              <section class="mt-7" aria-labelledby="welcome-next" data-testid="welcome-next">
                <h2 id="welcome-next" class="text-[13px] font-semibold tracking-[0.12em] text-muted uppercase">Tu próximo paso</h2>
                <div class="mt-3 flex flex-col gap-3 rounded-2xl border border-line-soft bg-surface p-4" [attr.data-tip]="tip">
                  <app-activation-tip [tip]="tip" [profile]="me" [withCopy]="true" (reviewRequested)="goToReviews()" />
                </div>
                @if (stepDone()) {
                  <p class="mt-2 text-[15px] font-bold text-success-strong" role="status">¡Listo, ya se ve tu foto!</p>
                }
                <p class="mt-3 text-[13.5px] leading-5 text-muted">Es opcional: lo podés hacer cuando quieras desde el panel y Mi perfil.</p>
              </section>
            }
          }

          @if (visibility() === 'VISIBLE') {
            <section class="mt-7 border-y border-line py-5" aria-labelledby="welcome-preview-title" data-testid="welcome-preview">
              <h2 id="welcome-preview-title" class="text-lg font-bold">Tu perfil, listo para mostrar</h2>
              <div class="mt-3 flex items-center gap-3">
                <app-avatar class="size-12 rounded-xl" [subject]="avatarOf(me)" alt="" />
                <div class="min-w-0"><p class="break-words font-semibold text-ink">{{ me.displayName }}</p><p class="break-words text-sm text-ink-soft">{{ me.headline }}</p></div>
              </div>
              @if (localities()) { <p class="mt-1 text-sm text-muted">{{ localities() }}</p> }
              <a [routerLink]="me.slug ? ['/p', me.slug] : ['/profesional', me.id]" class="mt-2 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-brand underline">Ver cómo lo ve un cliente<app-icon name="external" [size]="16" /></a>
              <p class="mt-1 text-sm leading-6 text-ink-soft">Revisá tu perfil real antes de compartirlo. Podés completar o cambiar tus datos desde Mi perfil.</p>
              @if (step() !== 'SHARE') {
                <app-profile-share class="mt-3 block" [profile]="me" [own]="true" [withCopy]="true" label="Compartir mi perfil" />
              }
            </section>
          }

          <div class="mt-4 flex flex-col gap-2.5 sm:flex-row" data-testid="welcome-actions">
            <a
              routerLink="/pro/dashboard"
              class="inline-flex min-h-12 items-center justify-center gap-1.5 rounded-xl px-6 text-[15px] font-semibold"
              [class]="visibility() === 'VISIBLE' && step() === 'SHARE' ? 'button-secondary' : 'button-primary'"
              >Ir al panel profesional<app-icon name="arrow-right" [size]="15" [stroke]="2.4"
            /></a>
            @if (me.status === 'ACTIVE' && !gap()) {
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
  protected readonly avatarOf = avatarOf;
  protected readonly store = inject(ProStore);
  private readonly me = computed(() => this.store.ownProfile());
  protected readonly visibility = computed(() => {
    const me = this.me();
    return me ? profileVisibility(me) : null;
  });
  protected readonly gap = computed(() => serviceGap(this.me()));
  /** Oficios sugeridos en revisión ("“A” y “B”"), o null si no hay (nada pendiente o ya resuelto). */
  protected readonly pendingOffer = computed(() => {
    const names = (this.gap()?.names ?? []).map((n) => `“${n}”`);
    if (!names.length) return null;
    return names.length > 1 ? `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}` : names[0];
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
  protected readonly licenseNames = computed(() => this.licenses().map((s) => s.name).join(' y '));

  private readonly auth = inject(AuthStore);
  private readonly photos = inject(WorkPhotosStore);
  private readonly session = inject(ActivationSession);
  private readonly router = inject(Router);
  private readonly photosCount = signal<number | null>(null);
  /** Lo ya salteado al llegar (por ejemplo "Configurar más tarde" en el alta): no se vuelve a proponer enseguida. */
  private readonly skippedOnEntry = this.session.skipped(this.auth.user()?.id);
  /** El único próximo paso: el primero de la secuencia de `activationTips`. Se fija al verlo y no cambia mientras se hace. */
  protected readonly step = signal<ActivationTip | null>(null);
  /** Ya hizo lo que proponía el paso (hoy solo la foto muestra confirmación en el lugar). */
  protected readonly stepDone = computed(() => {
    const me = this.me();
    const tip = this.step();
    return !!me && tip === 'AVATAR' && !!me.avatarUrl;
  });

  protected goToReviews(): void {
    void this.router.navigate(['/pro/dashboard'], { fragment: 'pedir-resenas' });
  }

  constructor() {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    void this.photos.load().then(() => this.photosCount.set(this.photos.loadError() ? null : this.photos.storedCount()));
    // Fija el paso una vez que se conocen el perfil y las fotos. Mostrarlo ya cuenta como visto: el Inicio no lo repite enseguida
    // (y nada se marca como hecho: lo hecho sale de los datos reales).
    effect(() => {
      const me = this.me();
      const photos = this.photosCount();
      if (!me || photos === null || untracked(() => this.step())) return;
      const tip = activationTips(me, photos, this.skippedOnEntry)[0] ?? null;
      untracked(() => {
        this.step.set(tip);
        if (tip) this.session.skip(this.auth.user()?.id, tip);
      });
    });
    const host = inject<ElementRef<HTMLElement>>(ElementRef);
    // Foco en el título cuando el perfil ya está en pantalla (una vez).
    const injector = inject(Injector);
    let focused = false;
    effect(() => {
      const me = this.me();
      if (focused || !me) return;
      focused = true;
      untracked(() =>
        afterNextRender(() => host.nativeElement.querySelector<HTMLElement>('#welcome-title')?.focus(), { injector }),
      );
    });
  }
}
