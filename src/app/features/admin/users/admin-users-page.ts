import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  AdminSubscriptionStatus,
  AdminUserItem,
  AdminUserKind,
  AdminUserPlan,
} from '../../../core/models/admin';
import { AuthStore } from '../../../core/state/auth.store';
import { AdminUsersStore } from '../../../core/state/admin-users.store';
import { formatTimestamp } from '../../../core/utils/dates';
import { Dialog } from '../../../shared/components/dialog/dialog';
import { AdminHeader } from '../admin-header';

export const USER_KINDS: { value: AdminUserKind; label: string }[] = [
  { value: 'active', label: 'Todas las cuentas activas' },
  { value: 'professionals', label: 'Profesionales' },
  { value: 'clients', label: 'Solo clientes' },
  { value: 'admins', label: 'Admins' },
  { value: 'deleted', label: 'Dadas de baja' },
];

const BLOCKER_TEXT = {
  ACTIVE_JOBS: (n: number) =>
    `Tiene ${n} ${n === 1 ? 'trabajo en curso' : 'trabajos en curso'} con otra persona.`,
  OPEN_SUBSCRIPTION: () => 'Tiene una suscripción PRO viva: cancelala antes en "Plan PRO".',
} as const;

const SUBSCRIPTION_STATUS: Record<AdminSubscriptionStatus, string> = {
  PENDING: 'Checkout sin terminar',
  ACTIVE: 'Activa',
  PAST_DUE: 'Con un cobro rechazado (Mercado Pago reintenta)',
  PAUSED: 'Pausada',
  CANCELLED: 'Cancelada',
};

/** Estados con renovación viva: los que se pueden cancelar. */
const CANCELLABLE: AdminSubscriptionStatus[] = ['PENDING', 'ACTIVE', 'PAST_DUE', 'PAUSED'];

export const GRANT_OPTIONS: { value: string; label: string }[] = [
  { value: '30', label: '30 días' },
  { value: '90', label: '90 días' },
  { value: '365', label: '1 año' },
  { value: 'none', label: 'Sin vencimiento' },
];

const ars = (n: number) => `$${n.toLocaleString('es-AR')}`;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Usuarios (solo admin): buscar, ver qué cuelga de cada cuenta y darla de baja
 * (anonimiza, la misma baja de cuenta) o borrarla definitivamente (cuentas de prueba).
 */
@Component({
  selector: 'app-admin-users-page',
  imports: [RouterLink, Dialog, AdminHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-admin-header current="usuarios" />

    <main id="main" class="mx-auto max-w-4xl px-4 pt-6 pb-16 sm:px-6 sm:pt-8">
      @if (!id()) {
        <h1
          class="font-display text-[30px] leading-tight font-bold tracking-[-0.02em] sm:text-[34px]"
        >
          Usuarios
        </h1>
        <p class="mt-1.5 text-[15px] text-ink-soft">
          Buscá una cuenta para ver su actividad, darla de baja o borrar una cuenta de prueba.
        </p>

        <form
          class="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end"
          role="search"
          (submit)="$event.preventDefault(); search()"
        >
          <div class="min-w-0 flex-1">
            <label for="user-q" class="block text-[14px] font-semibold text-ink">Buscar</label>
            <input
              id="user-q"
              #q
              type="search"
              autocomplete="off"
              placeholder="Email, nombre o apellido"
              maxlength="100"
              class="mt-1.5 h-12 w-full min-w-0 rounded-xl field-control px-3.5 text-base text-ink"
              [value]="store.q()"
            />
          </div>
          <div class="sm:w-56">
            <label for="user-kind" class="block text-[14px] font-semibold text-ink">Mostrar</label>
            <select
              id="user-kind"
              class="mt-1.5 h-12 w-full rounded-xl field-control px-3 text-base text-ink"
              [value]="store.kind()"
              (change)="filter($event)"
            >
              @for (k of kinds; track k.value) {
                <option [value]="k.value" [selected]="k.value === store.kind()">{{ k.label }}</option>
              }
            </select>
          </div>
          <button
            type="submit"
            class="button-primary h-12 rounded-xl px-5 text-[15px] font-semibold"
            data-testid="search"
          >
            Buscar
          </button>
        </form>

        @switch (store.state()) {
          @case ('error') {
            <div class="mt-5 rounded-2xl border border-line bg-surface p-5" role="alert">
              <p class="text-[15px] font-semibold">No pudimos cargar los usuarios.</p>
              <button
                type="button"
                class="mt-3 h-11 rounded-xl button-secondary px-4 text-[14.5px] font-bold"
                (click)="store.load()"
              >
                Reintentar
              </button>
            </div>
          }
          @case ('ready') {
            <p class="mt-5 text-[14px] text-muted" aria-live="polite" data-testid="count">
              @if (store.total() === 0) {
                Ninguna cuenta coincide.
              } @else {
                {{ range() }} de {{ plural(store.total(), 'cuenta', 'cuentas') }}
              }
            </p>
            @if (store.items().length) {
              <ul
                class="mt-2 divide-y divide-line-soft overflow-hidden rounded-2xl border border-line bg-surface"
                data-testid="users"
              >
                @for (u of store.items(); track u.id) {
                  <li>
                    <a
                      [routerLink]="['/admin/usuarios', u.id]"
                      class="flex flex-col gap-1 px-4 py-3 hover:bg-sand sm:flex-row sm:items-center sm:gap-4"
                    >
                      <span class="min-w-0 flex-1">
                        <span class="block truncate text-[15.5px] font-semibold text-ink"
                          >{{ u.firstName }} {{ u.lastName }}</span
                        >
                        <span class="block truncate text-[14px] text-ink-soft">{{ u.email }}</span>
                      </span>
                      <span class="flex flex-wrap items-center gap-1.5">
                        @for (b of badges(u); track b.label) {
                          <span class="rounded-md px-1.5 py-0.5 text-[12.5px] font-semibold" [class]="b.tone">{{
                            b.label
                          }}</span>
                        }
                        <span class="text-[13px] text-muted">Alta {{ when(u.createdAt) }}</span>
                      </span>
                    </a>
                  </li>
                }
              </ul>
            }
            @if (pages() > 1) {
              <nav class="mt-4 flex items-center justify-between gap-2" aria-label="Páginas">
                <button
                  type="button"
                  class="h-11 rounded-xl button-secondary px-4 text-[14.5px] font-semibold disabled:opacity-50"
                  [disabled]="store.page() <= 1"
                  (click)="store.goToPage(store.page() - 1)"
                >
                  ‹ Anterior
                </button>
                <span class="text-[14px] text-muted">Página {{ store.page() }} de {{ pages() }}</span>
                <button
                  type="button"
                  class="h-11 rounded-xl button-secondary px-4 text-[14.5px] font-semibold disabled:opacity-50"
                  [disabled]="store.page() >= pages()"
                  (click)="store.goToPage(store.page() + 1)"
                >
                  Siguiente ›
                </button>
              </nav>
            }
          }
          @default {
            <p class="mt-6 text-[15px] text-muted" role="status">Cargando usuarios…</p>
          }
        }
      } @else {
        <a
          routerLink="/admin/usuarios"
          class="inline-flex h-10 items-center rounded-lg text-[14.5px] font-semibold text-brand hover:underline"
          >‹ Volver a usuarios</a
        >

        @switch (store.detailState()) {
          @case ('error') {
            <div class="mt-4 rounded-2xl border border-line bg-surface p-5" role="alert">
              <p class="text-[15px] font-semibold">No pudimos cargar esta cuenta.</p>
              <p class="mt-1 text-[14px] text-muted">Puede que ya no exista.</p>
              <button
                type="button"
                class="mt-3 h-11 rounded-xl button-secondary px-4 text-[14.5px] font-bold"
                (click)="store.open(id()!)"
              >
                Reintentar
              </button>
            </div>
          }
          @case ('ready') {
            @if (store.detail(); as d) {
              <h1
                #detailHeading
                tabindex="-1"
                class="mt-2 font-display text-[28px] leading-tight font-bold tracking-[-0.02em] break-words outline-none sm:text-[32px]"
              >
                {{ d.user.firstName }} {{ d.user.lastName }}
              </h1>
              <p class="mt-1 text-[15px] break-all text-ink-soft" data-testid="email">{{ d.user.email }}</p>
              <div class="mt-2 flex flex-wrap gap-1.5">
                @for (b of badges(d.user); track b.label) {
                  <span class="rounded-md px-1.5 py-0.5 text-[12.5px] font-semibold" [class]="b.tone">{{
                    b.label
                  }}</span>
                }
              </div>

              @if (store.actionError()) {
                <p
                  class="mt-4 rounded-xl bg-danger-soft px-3.5 py-2.5 text-[14px] font-medium text-danger"
                  role="alert"
                >
                  {{ store.actionError() }}
                </p>
              }

              <section class="mt-6 rounded-2xl border border-line bg-surface p-5" aria-labelledby="data">
                <h2 id="data" class="text-[17px] font-bold">Datos</h2>
                <dl class="mt-3 grid gap-x-6 gap-y-2.5 text-[14.5px] sm:grid-cols-2">
                  <div>
                    <dt class="text-muted">Alta</dt>
                    <dd class="font-medium">{{ when(d.user.createdAt) }}</dd>
                  </div>
                  <div>
                    <dt class="text-muted">Teléfono</dt>
                    <dd class="font-medium">{{ d.user.phone || 'Sin cargar' }}</dd>
                  </div>
                  <div>
                    <dt class="text-muted">Email verificado</dt>
                    <dd class="font-medium">
                      {{ d.user.emailVerifiedAt ? when(d.user.emailVerifiedAt) : 'No' }}
                    </dd>
                  </div>
                  <div>
                    <dt class="text-muted">Términos aceptados</dt>
                    <dd class="font-medium">
                      {{ d.user.termsAcceptedAt ? when(d.user.termsAcceptedAt) : 'Cuenta anterior' }}
                    </dd>
                  </div>
                  @if (d.user.deletedAt) {
                    <div>
                      <dt class="text-muted">Dada de baja</dt>
                      <dd class="font-medium">{{ when(d.user.deletedAt) }}</dd>
                    </div>
                  }
                  @if (d.user.professional; as p) {
                    <div>
                      <dt class="text-muted">Perfil profesional</dt>
                      <dd class="font-medium">
                        {{ p.status === 'ACTIVE' ? 'Visible' : 'Pausado' }} · {{ p.pro ? 'PRO' : 'Free' }}
                        @if (p.status === 'ACTIVE' && !d.user.deletedAt) {
                          ·
                          <a
                            [routerLink]="['/profesional', p.id]"
                            class="font-semibold text-brand hover:underline"
                            >Ver perfil</a
                          >
                        }
                      </dd>
                    </div>
                  }
                </dl>
              </section>

              <section class="mt-4 rounded-2xl border border-line bg-surface p-5" aria-labelledby="activity">
                <h2 id="activity" class="text-[17px] font-bold">Actividad</h2>
                <ul class="mt-3 grid gap-2 text-[14.5px] sm:grid-cols-2" data-testid="activity">
                  <li>{{ plural(d.activity.requests, 'solicitud como cliente', 'solicitudes como cliente') }}</li>
                  @if (d.user.professional) {
                    <li>{{ plural(d.activity.quotes, 'presupuesto enviado', 'presupuestos enviados') }}</li>
                    <li>{{ plural(d.activity.reviewsReceived, 'reseña recibida', 'reseñas recibidas') }}</li>
                  }
                  <li>{{ plural(d.activity.jobs, 'trabajo', 'trabajos') }}</li>
                  <li>{{ plural(d.activity.reviewsWritten, 'reseña escrita', 'reseñas escritas') }}</li>
                  <li>
                    Interactuó con
                    {{ plural(d.activity.counterparts, 'otra persona', 'otras personas') }}
                  </li>
                </ul>
              </section>

              @if (d.plan; as plan) {
                <section
                  class="mt-4 rounded-2xl border border-line bg-surface p-5"
                  aria-labelledby="plan"
                >
                  <h2 id="plan" class="text-[17px] font-bold">Plan PRO</h2>
                  <p class="mt-2 text-[15px] font-semibold" data-testid="plan-state">
                    {{ planState(plan) }}
                  </p>
                  @if (plan.subscription; as s) {
                    <dl
                      class="mt-3 grid gap-x-6 gap-y-2.5 text-[14.5px] sm:grid-cols-2"
                      data-testid="subscription"
                    >
                      <div>
                        <dt class="text-muted">Suscripción de Mercado Pago</dt>
                        <dd class="font-medium">
                          {{ statusLabel(s.status) }} · {{ money(s.currentAmount) }} / mes
                        </dd>
                      </div>
                      @if (s.nextPaymentAt) {
                        <div>
                          <dt class="text-muted">Próximo cobro</dt>
                          <dd class="font-medium">{{ when(s.nextPaymentAt) }}</dd>
                        </div>
                      }
                      @if (s.status === 'CANCELLED') {
                        <div>
                          <dt class="text-muted">PRO pago hasta</dt>
                          <dd class="font-medium">
                            {{ s.accessUntil ? when(s.accessUntil) : 'Ya terminó' }}
                          </dd>
                        </div>
                      }
                    </dl>
                  }

                  @if (canCancel(plan)) {
                    <div class="mt-4 border-t border-line pt-4">
                      <h3 class="text-[15.5px] font-semibold">Cancelar suscripción</h3>
                      <p class="mt-1 text-[14.5px] text-ink-soft">
                        Lo mismo que "Cancelar" en Mi plan: Mercado Pago deja de cobrarle y conserva
                        PRO hasta el fin del período que ya pagó. No le devuelve dinero.
                      </p>
                      <button
                        type="button"
                        class="mt-3 h-11 rounded-xl button-secondary px-4 text-[14.5px] font-semibold disabled:opacity-50"
                        [disabled]="store.acting()"
                        (click)="openDialog('cancel')"
                        data-testid="cancel-subscription"
                      >
                        Cancelar suscripción
                      </button>
                    </div>
                  }

                  @if (!d.user.deletedAt) {
                    <div class="mt-4 border-t border-line pt-4">
                      <h3 class="text-[15.5px] font-semibold">Dar PRO</h3>
                      @if (paying(plan)) {
                        <p class="mt-1 text-[14.5px] text-ink-soft" data-testid="grant-blocked">
                          Ya paga PRO con Mercado Pago. Para darle PRO sin cargo, cancelá antes la
                          suscripción así no se le sigue cobrando.
                        </p>
                      } @else {
                        <p class="mt-1 text-[14.5px] text-ink-soft">
                          PRO de cortesía, sin cobro. Al vencer vuelve a Free solo, sin borrar nada.
                          @if (plan.manualActive) {
                            Reemplaza el vencimiento actual.
                          }
                        </p>
                        <div class="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
                          <div class="sm:w-48">
                            <label for="grant-days" class="block text-[14px] font-semibold text-ink"
                              >Duración</label
                            >
                            <select
                              id="grant-days"
                              class="mt-1.5 h-11 w-full rounded-xl field-control px-3 text-base text-ink"
                              [value]="grantDays()"
                              (change)="grantDays.set($any($event.target).value)"
                            >
                              @for (o of grantOptions; track o.value) {
                                <option [value]="o.value" [selected]="o.value === grantDays()">
                                  {{ o.label }}
                                </option>
                              }
                            </select>
                          </div>
                          <button
                            type="button"
                            class="button-primary h-11 rounded-xl px-4 text-[14.5px] font-semibold disabled:opacity-60"
                            [disabled]="store.acting()"
                            (click)="grantPro()"
                            data-testid="grant-pro"
                          >
                            Dar PRO
                          </button>
                        </div>
                      }
                    </div>
                  }

                  @if (plan.manualActive) {
                    <div class="mt-4 border-t border-line pt-4">
                      <h3 class="text-[15.5px] font-semibold">Quitar PRO manual</h3>
                      <p class="mt-1 text-[14.5px] text-ink-soft">
                        Vuelve a Free salvo que tenga PRO pago o de referidos vigente (eso no se
                        toca).
                      </p>
                      <button
                        type="button"
                        class="mt-3 h-11 rounded-xl button-secondary px-4 text-[14.5px] font-semibold disabled:opacity-50"
                        [disabled]="store.acting()"
                        (click)="revokePro()"
                        data-testid="revoke-pro"
                      >
                        Quitar PRO manual
                      </button>
                    </div>
                  }
                </section>
              }

              <section class="mt-4 rounded-2xl border border-line bg-surface p-5" aria-labelledby="actions">
                <h2 id="actions" class="text-[17px] font-bold">Acciones</h2>
                @if (isProtected()) {
                  <p class="mt-2 text-[14.5px] text-ink-soft" data-testid="protected">
                    {{ isSelf() ? selfNote : adminNote }}
                  </p>
                } @else {
                  @if (!d.user.deletedAt) {
                    <div class="mt-3">
                      <h3 class="text-[15.5px] font-semibold">Dar de baja</h3>
                      <p class="mt-1 text-[14.5px] text-ink-soft">
                        La misma baja que hace la persona desde Mi perfil: queda como "Usuario eliminado",
                        no puede volver a entrar y su email queda libre. Se conserva lo que compartió con
                        otras personas (presupuestos, trabajos, reseñas). Es la opción para una cuenta real.
                      </p>
                      @if (d.blockers.length) {
                        <ul class="mt-2 list-disc pl-5 text-[14px] text-accent-ink" data-testid="blockers">
                          @for (b of d.blockers; track b.code) {
                            <li>{{ blockerText(b.code, b.count) }}</li>
                          }
                        </ul>
                      }
                      <button
                        type="button"
                        class="mt-3 h-11 rounded-xl button-secondary px-4 text-[14.5px] font-semibold disabled:opacity-50"
                        [disabled]="d.blockers.length > 0 || store.acting()"
                        (click)="dialog.set('deactivate')"
                        data-testid="deactivate"
                      >
                        Dar de baja
                      </button>
                    </div>
                  }
                  <div class="mt-5 border-t border-line pt-4">
                    <h3 class="text-[15.5px] font-semibold text-danger">Borrar definitivamente</h3>
                    <p class="mt-1 text-[14.5px] text-ink-soft">
                      Para cuentas de prueba. Se borra la cuenta y todo lo que cuelga de ella, también lo
                      que compartió con otras personas, y sus fotos y documentos. No se puede deshacer.
                    </p>
                    <button
                      type="button"
                      class="mt-3 h-11 rounded-xl bg-danger-fill px-4 text-[14.5px] font-semibold text-white disabled:opacity-60"
                      [disabled]="store.acting()"
                      (click)="openPurge()"
                      data-testid="purge"
                    >
                      Borrar definitivamente
                    </button>
                  </div>
                }
              </section>
            }
          }
          @default {
            <p class="mt-6 text-[15px] text-muted" role="status">Cargando cuenta…</p>
          }
        }
      }
    </main>

    <app-dialog
      [open]="dialog() === 'deactivate'"
      labelledBy="deactivate-title"
      [dismissable]="!store.acting()"
      (dismiss)="dialog.set(null)"
    >
      <h2 id="deactivate-title" class="font-display text-2xl font-bold">¿Dar de baja esta cuenta?</h2>
      @if (store.detail(); as d) {
        <p class="mt-2 text-[15px] leading-6 break-words">
          <strong>{{ d.user.firstName }} {{ d.user.lastName }}</strong> ({{ d.user.email }}) queda como
          "Usuario eliminado" y no puede volver a entrar. Sus solicitudes abiertas se cancelan y sus
          fotos y documentos se borran.
        </p>
      }
      <div class="mt-5 flex flex-col gap-2 sm:flex-row-reverse">
        <button
          type="button"
          class="button-primary min-h-12 rounded-xl px-5 text-[16px] font-semibold disabled:opacity-60 sm:flex-1"
          [disabled]="store.acting()"
          (click)="deactivate()"
          data-testid="confirm-deactivate"
        >
          {{ store.acting() ? 'Dando de baja…' : 'Dar de baja' }}
        </button>
        <button
          type="button"
          class="button-secondary min-h-12 rounded-xl px-5 text-[16px] font-semibold sm:flex-1"
          [disabled]="store.acting()"
          (click)="dialog.set(null)"
        >
          Cancelar
        </button>
      </div>
    </app-dialog>

    <app-dialog
      [open]="dialog() === 'cancel'"
      labelledBy="cancel-title"
      [dismissable]="!store.acting()"
      (dismiss)="dialog.set(null)"
    >
      <h2 id="cancel-title" class="font-display text-2xl font-bold">
        ¿Cancelar su suscripción PRO?
      </h2>
      @if (store.detail(); as d) {
        <p class="mt-2 text-[15px] leading-6 break-words">
          Mercado Pago deja de cobrarle a
          <strong>{{ d.user.firstName }} {{ d.user.lastName }}</strong
          >. Conserva PRO hasta el fin del período que ya pagó. No se le devuelve dinero.
        </p>
        @if (store.actionError()) {
          <p class="mt-2 text-[14px] font-semibold text-danger" role="alert">
            {{ store.actionError() }}
          </p>
        }
      }
      <div class="mt-5 flex flex-col gap-2 sm:flex-row-reverse">
        <button
          type="button"
          class="button-primary min-h-12 rounded-xl px-5 text-[16px] font-semibold disabled:opacity-60 sm:flex-1"
          [disabled]="store.acting()"
          (click)="cancelSubscription()"
          data-testid="confirm-cancel-subscription"
        >
          {{ store.acting() ? 'Cancelando…' : 'Sí, cancelar' }}
        </button>
        <button
          type="button"
          class="button-secondary min-h-12 rounded-xl px-5 text-[16px] font-semibold sm:flex-1"
          [disabled]="store.acting()"
          (click)="dialog.set(null)"
        >
          Volver
        </button>
      </div>
    </app-dialog>

    <app-dialog
      [open]="dialog() === 'purge'"
      labelledBy="purge-title"
      [dismissable]="!store.acting()"
      (dismiss)="dialog.set(null)"
    >
      <h2 id="purge-title" class="font-display text-2xl font-bold">Borrar definitivamente</h2>
      @if (store.detail(); as d) {
        <p class="mt-2 text-[15px] leading-6">
          Se borra la cuenta, su perfil y todo lo que cuelga de ella. No se puede deshacer.
        </p>
        @if (d.activity.counterparts > 0) {
          <p
            class="mt-2 rounded-xl bg-accent-soft px-3.5 py-2.5 text-[14.5px] font-semibold text-accent-ink"
            data-testid="purge-counterparts"
          >
            Interactuó con {{ plural(d.activity.counterparts, 'otra persona', 'otras personas') }}: sus
            presupuestos, trabajos y reseñas con esta cuenta también se borran. Si no son cuentas de
            prueba, usá "Dar de baja".
          </p>
        }
        @if (d.activity.openSubscriptions > 0) {
          <p
            class="mt-2 rounded-xl bg-danger-soft px-3.5 py-2.5 text-[14.5px] font-semibold text-danger"
            data-testid="purge-subscription"
          >
            Tiene una suscripción PRO viva. Borrar la cuenta no la cancela en Mercado Pago: cancelala
            antes en "Plan PRO" para que no se le siga cobrando.
          </p>
        }
        <label for="purge-email" class="mt-4 block text-[14.5px] font-semibold text-ink">
          Para confirmar, escribí su email:
          <span class="block font-normal break-all text-ink-soft">{{ d.user.email }}</span>
        </label>
        <input
          id="purge-email"
          #purgeInput
          type="email"
          autocomplete="off"
          spellcheck="false"
          class="mt-1.5 h-12 w-full min-w-0 rounded-xl field-control px-3.5 text-base text-ink"
          [value]="confirmEmail()"
          (input)="confirmEmail.set($any($event.target).value)"
        />
        @if (store.actionError()) {
          <p class="mt-2 text-[14px] font-semibold text-danger" role="alert">{{ store.actionError() }}</p>
        }
      }
      <div class="mt-5 flex flex-col gap-2 sm:flex-row-reverse">
        <button
          type="button"
          class="min-h-12 rounded-xl bg-danger-fill px-5 text-[16px] font-semibold text-white disabled:opacity-60 sm:flex-1"
          [disabled]="store.acting() || !emailMatches()"
          (click)="purge()"
          data-testid="confirm-purge"
        >
          {{ store.acting() ? 'Borrando…' : 'Borrar para siempre' }}
        </button>
        <button
          type="button"
          class="button-secondary min-h-12 rounded-xl px-5 text-[16px] font-semibold sm:flex-1"
          [disabled]="store.acting()"
          (click)="dialog.set(null)"
        >
          Cancelar
        </button>
      </div>
    </app-dialog>
  `,
})
export class AdminUsersPage {
  protected readonly store = inject(AdminUsersStore);
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);

  /** `/admin/usuarios/:id` → detalle de la cuenta. */
  readonly id = input<string | undefined>(undefined);

  protected readonly kinds = USER_KINDS;
  protected readonly selfNote = 'Es tu propia cuenta: no se da de baja ni se borra desde el panel.';
  protected readonly adminNote =
    'Es una cuenta admin. Para darla de baja o borrarla, primero quitale el acceso desde la terminal (npm run admin:grant -- <email> --revoke).';
  protected readonly plural = plural;
  protected readonly dialog = signal<'deactivate' | 'purge' | 'cancel' | null>(null);
  protected readonly confirmEmail = signal('');
  protected readonly grantOptions = GRANT_OPTIONS;
  protected readonly grantDays = signal('30');
  protected readonly money = ars;

  private readonly queryInput = viewChild<ElementRef<HTMLInputElement>>('q');
  private readonly detailHeading = viewChild<ElementRef<HTMLElement>>('detailHeading');

  protected readonly pages = computed(() => Math.max(1, Math.ceil(this.store.total() / this.store.pageSize())));
  protected readonly range = computed(() => {
    const from = (this.store.page() - 1) * this.store.pageSize() + 1;
    return `${from}–${from + this.store.items().length - 1}`;
  });
  protected readonly isSelf = computed(() => this.store.detail()?.user.id === this.auth.user()?.id);
  protected readonly isProtected = computed(() => this.isSelf() || !!this.store.detail()?.user.isAdmin);
  protected readonly emailMatches = computed(
    () =>
      !!this.store.detail() &&
      this.confirmEmail().trim().toLowerCase() === this.store.detail()!.user.email.toLowerCase(),
  );

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => {
        this.dialog.set(null);
        // Volver del detalle refresca la lista sin perder la búsqueda (queda en el store).
        if (id) void this.store.open(id).then(() => this.focusHeading());
        else void this.store.load();
      });
    });
  }

  protected when(value: string): string {
    return formatTimestamp(value);
  }

  protected badges(u: AdminUserItem): { label: string; tone: string }[] {
    const out: { label: string; tone: string }[] = [];
    if (u.deletedAt) out.push({ label: 'Dada de baja', tone: 'bg-neutral-soft text-neutral' });
    if (u.isAdmin) out.push({ label: 'Admin', tone: 'bg-accent-soft text-accent-ink' });
    if (u.professional) {
      out.push({ label: 'Profesional', tone: 'bg-brand-soft text-brand-dark' });
      if (u.professional.pro) out.push({ label: 'PRO', tone: 'bg-brand-soft text-brand-dark' });
      if (u.professional.status === 'PAUSED' && !u.deletedAt) {
        out.push({ label: 'Pausado', tone: 'bg-neutral-soft text-neutral' });
      }
    }
    return out;
  }

  protected blockerText(code: keyof typeof BLOCKER_TEXT, count: number): string {
    return BLOCKER_TEXT[code](count);
  }

  protected search(): void {
    void this.store.search(this.queryInput()?.nativeElement.value ?? '');
  }

  protected filter(event: Event): void {
    void this.store.filter((event.target as HTMLSelectElement).value as AdminUserKind);
  }

  protected planState(plan: AdminUserPlan): string {
    if (plan.source === 'MANUAL') {
      return plan.manualUntil
        ? `PRO manual hasta ${this.when(plan.manualUntil)}`
        : 'PRO manual sin vencimiento';
    }
    if (plan.source === 'BILLING') {
      // Con la renovación viva, `billingProUntil` incluye la gracia: la fecha útil es el próximo cobro.
      return plan.subscription?.status === 'CANCELLED'
        ? `PRO pago por Mercado Pago hasta ${this.when(plan.billingProUntil!)}`
        : 'PRO pago por Mercado Pago';
    }
    if (plan.source === 'BONUS') return `PRO por referidos hasta ${this.when(plan.bonusProUntil!)}`;
    return 'Free';
  }

  protected statusLabel(status: AdminSubscriptionStatus): string {
    return SUBSCRIPTION_STATUS[status];
  }

  protected canCancel(plan: AdminUserPlan): boolean {
    return (
      plan.billingEnabled && !!plan.subscription && CANCELLABLE.includes(plan.subscription.status)
    );
  }

  /** Suscripción cobrando: dar PRO manual se bloquea (también en el backend). */
  protected paying(plan: AdminUserPlan): boolean {
    return plan.subscription?.status === 'ACTIVE' || plan.subscription?.status === 'PAST_DUE';
  }

  protected openDialog(kind: 'cancel'): void {
    this.store.actionError.set(null);
    this.dialog.set(kind);
  }

  protected grantPro(): void {
    const value = this.grantDays();
    void this.store.grantPro(this.id()!, value === 'none' ? null : Number(value));
  }

  protected revokePro(): void {
    void this.store.revokePro(this.id()!);
  }

  protected async cancelSubscription(): Promise<void> {
    if (await this.store.cancelSubscription(this.id()!)) this.dialog.set(null);
  }

  protected openPurge(): void {
    this.confirmEmail.set('');
    this.store.actionError.set(null);
    this.dialog.set('purge');
  }

  protected async deactivate(): Promise<void> {
    await this.store.deactivate(this.id()!);
    this.dialog.set(null);
  }

  protected async purge(): Promise<void> {
    const ok = await this.store.purge(this.id()!, this.confirmEmail());
    if (!ok) return;
    this.dialog.set(null);
    void this.router.navigate(['/admin/usuarios']);
  }

  private focusHeading(): void {
    setTimeout(() => this.detailHeading()?.nativeElement.focus({ preventScroll: true }));
  }
}
