import {
  ChangeDetectionStrategy,
  Component,
  PLATFORM_ID,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { API_URL } from '../../../core/api/api.config';

@Component({
  selector: 'app-acquisition-month',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (data(); as d) {
      @if (d.available) {
        <section class="mt-7 border-t border-line pt-5" aria-labelledby="acquisition-month-title">
          <h2 id="acquisition-month-title" class="font-display text-2xl font-bold">
            Tu perfil trae oportunidades
          </h2>
          <p class="mt-1 text-sm text-muted">
            Visitas anónimas y solicitudes recibidas este mes, según el enlace de origen.
          </p>
          <dl class="mt-4 grid grid-cols-2 gap-y-4 lg:grid-cols-4 [&>div]:border-line-soft lg:[&>div]:border-l lg:[&>div]:pl-6 lg:[&>div:first-child]:border-l-0 lg:[&>div:first-child]:pl-0 max-lg:[&>div:nth-child(even)]:border-l max-lg:[&>div:nth-child(even)]:pl-5">
            <div>
              <dt class="text-sm text-muted">Visitas a tu perfil</dt>
              <dd class="mt-1 text-2xl font-semibold tabular-nums">{{ d.profileVisits }}</dd>
            </div>
            <div>
              <dt class="text-sm text-muted">Desde tu perfil</dt>
              <dd class="mt-1 text-2xl font-semibold tabular-nums">{{ d.publicProfile }}</dd>
            </div>
            <div>
              <dt class="text-sm text-muted">Desde QR</dt>
              <dd class="mt-1 text-2xl font-semibold tabular-nums">{{ d.qr }}</dd>
            </div>
            <div>
              <dt class="text-sm text-muted">Desde compartir</dt>
              <dd class="mt-1 text-2xl font-semibold tabular-nums">{{ d.share }}</dd>
            </div>
          </dl>
        </section>
      }
    } @else if (failed()) {
      <p role="status" class="mt-5 text-sm text-muted">
        No pudimos cargar los orígenes de tus solicitudes.
      </p>
    }`,
})
export class AcquisitionMonth {
  readonly period = input.required<{ year: number; month: number }>();
  private readonly http = inject(HttpClient);
  private readonly api = inject(API_URL);
  protected readonly data = signal<{
    available: boolean;
    profileVisits?: number;
    publicProfile?: number;
    qr?: number;
    share?: number;
  } | null>(null);
  protected readonly failed = signal(false);
  constructor() {
    const browser = isPlatformBrowser(inject(PLATFORM_ID));
    effect((onCleanup) => {
      const period = this.period();
      if (!browser) return;
      this.data.set(null);
      this.failed.set(false);
      const sub = this.http
        .get<NonNullable<ReturnType<typeof this.data>>>(`${this.api}/pro/acquisition/month`, {
          params: { year: period.year, month: period.month },
        })
        .subscribe({ next: (d) => this.data.set(d), error: () => this.failed.set(true) });
      onCleanup(() => sub.unsubscribe());
    });
  }
}
