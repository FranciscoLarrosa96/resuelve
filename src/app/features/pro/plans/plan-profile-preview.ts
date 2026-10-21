import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import { OwnProfessional } from '../../../core/models/pro-profile';
import { WorkCoverItem, WorkCovers } from '../../../shared/components/work-covers/work-covers';
import { PRO_WORK_LIMIT } from '../../../core/state/work-photos.store';

/** Comparación de presentación: no activa el plan ni promete una posición en búsquedas. */
@Component({
  selector: 'app-plan-profile-preview',
  imports: [WorkCovers],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="rounded-2xl border border-line bg-surface p-5" aria-labelledby="profile-preview-title" data-testid="plan-profile-preview">
      <h2 id="profile-preview-title" class="text-xl font-bold">Así se vería tu perfil</h2>
      <p class="mt-2 text-sm leading-6 text-muted">Compará la presentación con tus datos. Es una vista previa: no cambia tu plan.</p>
      <div class="mt-4 inline-flex rounded-xl border border-line bg-canvas p-1" role="group" aria-label="Plan de la vista previa">
        <button type="button" class="min-h-11 rounded-lg px-5 text-sm font-semibold" [class.bg-primary]="!paid()" [class.text-on-primary]="!paid()" [attr.aria-pressed]="!paid()" (click)="paid.set(false)">Gratis</button>
        <button type="button" class="min-h-11 rounded-lg px-5 text-sm font-semibold" [class.bg-primary]="paid()" [class.text-on-primary]="paid()" [attr.aria-pressed]="paid()" (click)="paid.set(true)">PRO</button>
      </div>
      @if (profile(); as p) {
        <div class="mt-5 overflow-hidden rounded-xl border border-line" data-testid="profile-preview-card">
          @if (paid()) {
            @if (p.savedCoverUrl) { <img [src]="p.savedCoverUrl" alt="Tu foto de portada" class="h-36 w-full object-cover" /> } @else { <div class="border-b border-brand-line bg-brand-tint px-4 py-5 text-sm font-semibold text-brand">Espacio para tu foto de portada · PRO</div> }
          }
          <div class="p-4">
            <div class="flex items-center gap-3">
              @if (p.avatarUrl) { <img [src]="p.avatarUrl" alt="" width="56" height="56" class="size-14 rounded-xl object-cover" /> }
              <div class="min-w-0">
                <p class="flex flex-wrap items-center gap-2 text-lg font-bold">{{ p.displayName }} @if (paid()) { <span class="rounded bg-brand-soft px-2 py-1 text-xs text-brand-dark">PRO</span> }</p>
                <p class="mt-1 text-sm text-muted">{{ p.headline }}</p>
                @if (p.reviewsCount > 0) { <p class="mt-1 text-sm text-ink-soft">{{ p.averageRating }} · {{ p.reviewsCount }} reseñas</p> }
              </div>
            </div>
            @if (paid()) {
              @if (covers(); as c) {
                <div class="mt-4"><app-work-covers [covers]="c.covers" [example]="c.example" /></div>
                @if (c.example) { <p class="mt-2 text-xs leading-5 text-muted">Fotos de ejemplo. Con PRO mostrás las de tus trabajos.</p> }
              }
              <p class="mt-4 text-sm leading-6 text-ink-soft">Hasta {{ limit }} trabajos con fotos, fijados y antes/después. Presupuestos en PDF y Tu mes en CSV incluidos.</p>
            } @else {
              <p class="mt-4 text-sm leading-6 text-ink-soft">Tu perfil, foto personal, reseñas y canales de contacto. Los trabajos con fotos y la portada requieren PRO.</p>
            }
          </div>
        </div>
      } @else { <p class="mt-4 text-sm text-muted">Cargando los datos de tu perfil…</p> }
      <p class="mt-4 text-xs leading-5 text-muted">PRO permite participar en espacios Destacados cuando cumplís los requisitos. Esta comparación no garantiza posiciones, consultas ni trabajos.</p>
    </section>
  `,
})
export class PlanProfilePreview {
  readonly profile = input<OwnProfessional | null>(null);
  readonly covers = input<{ covers: WorkCoverItem[]; example: boolean } | null>(null);
  protected readonly paid = signal(true);
  protected readonly limit = PRO_WORK_LIMIT;
}
