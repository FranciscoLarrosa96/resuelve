import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, signal, viewChild } from '@angular/core';
import { DOCUMENT_ACCEPT, OfferedService, OwnVerification } from '../../../core/models/pro-profile';
import { ProStore, documentProblem } from '../../../core/state/pro.store';
import { formatTimestamp, localIsoDate } from '../../../core/utils/dates';
import { Icon } from '../../../shared/components/icon/icon';
import { LICENSE_UI } from './license-ui';

/**
 * Matrícula de UN servicio que la requiere: estado real, motivo de rechazo y
 * el formulario de envío (número obligatorio; vencimiento y documento opcionales).
 * El documento va directo al almacenamiento privado; nunca se muestra acá.
 */
@Component({
  selector: 'app-license-card',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @let s = service();
    @let ui = status();
    <article class="py-5" [attr.aria-labelledby]="'lic-' + s.id">
      <div class="flex flex-wrap items-start gap-x-3 gap-y-2">
        <div class="min-w-0 flex-1">
          <h3 [id]="'lic-' + s.id" class="text-[16px] font-bold">{{ s.name }}</h3>
          <p class="mt-1 flex items-center gap-1.5 text-[14.5px] font-semibold" [class]="toneText()">
            @if (s.licenseStatus === 'VERIFIED') { <app-icon name="check" [size]="15" [stroke]="2.8" /> }
            {{ ui.title }}
          </p>
          <p class="mt-1 max-w-prose text-[14px] leading-[1.45] text-muted">{{ ui.detail }}</p>

          @if (latest(); as v) {
            <dl class="mt-2.5 flex flex-wrap gap-x-5 gap-y-1 text-[13.5px]">
              @if (v.reference) { <div class="flex gap-1.5"><dt class="text-muted">Referencia</dt><dd class="font-medium tabular-nums">{{ v.reference }}</dd></div> }
              <div class="flex gap-1.5"><dt class="text-muted">Enviada</dt><dd class="font-medium">{{ date(v.submittedAt) }}</dd></div>
              @if (v.expiresAt) { <div class="flex gap-1.5"><dt class="text-muted">Vence</dt><dd class="font-medium">{{ date(v.expiresAt) }}</dd></div> }
            </dl>
            @if (s.licenseStatus === 'REJECTED' && v.rejectionReason) {
              <div class="mt-3 max-w-prose rounded-xl bg-danger-soft px-3.5 py-2.5 text-[14px] leading-[1.45] text-danger">
                <span class="font-semibold">Motivo:</span> {{ v.rejectionReason }}
              </div>
            }
          }
        </div>
      </div>

      @if (ui.action && !open()) {
        <button type="button" class="mt-3.5 h-11 rounded-xl border border-line-btn bg-white px-4 text-[14.5px] font-bold text-ink hover:bg-sand-light" (click)="start()">{{ ui.action }}</button>
      }

      @if (open()) {
        <form class="mt-4 flex max-w-xl flex-col gap-4 rounded-2xl border border-line bg-white p-4.5" novalidate (submit)="$event.preventDefault(); send()" [attr.aria-label]="'Enviar matrícula de ' + s.name">
          <div>
            <label [for]="'ref-' + s.id" class="block text-[14px] font-semibold">Número o referencia de matrícula</label>
            <input #refInput [id]="'ref-' + s.id" type="text" maxlength="120" autocomplete="off" [value]="reference()" (input)="reference.set($any($event.target).value)"
              class="mt-1.5 h-12 w-full rounded-xl border border-line-input bg-white px-3.5 text-[15px] outline-none focus:border-brand" [attr.aria-describedby]="'ref-help-' + s.id" />
            <p [id]="'ref-help-' + s.id" class="mt-1 text-[12.5px] text-muted">Lo verificamos en el registro oficial: tiene que estar vigente y a tu nombre.</p>
          </div>
          <div>
            <label [for]="'exp-' + s.id" class="block text-[14px] font-semibold">Vencimiento <span class="font-normal text-muted">(si tiene)</span></label>
            <input [id]="'exp-' + s.id" type="date" [min]="tomorrow" [value]="expiresAt()" (input)="expiresAt.set($any($event.target).value)"
              class="mt-1.5 h-12 w-full max-w-60 rounded-xl border border-line-input bg-white px-3.5 text-[15px] outline-none focus:border-brand" />
          </div>
          <div>
            <label [for]="'doc-' + s.id" class="block text-[14px] font-semibold">Foto o PDF de la matrícula <span class="font-normal text-muted">(opcional)</span></label>
            <input [id]="'doc-' + s.id" type="file" [accept]="accept" (change)="pick($event)" [attr.aria-describedby]="'doc-help-' + s.id"
              class="mt-1.5 block w-full text-[14px] file:mr-3 file:h-11 file:cursor-pointer file:rounded-xl file:border file:border-line-btn file:bg-white file:px-4 file:font-bold file:text-ink hover:file:bg-sand-light" />
            <p [id]="'doc-help-' + s.id" class="mt-1.5 flex gap-1.5 text-[12.5px] leading-[1.4] text-muted">
              <app-icon name="lock" [size]="13" class="mt-px shrink-0 text-brand" />
              Ayuda si el número no aparece claro en el registro. PDF, JPG, PNG o WebP de hasta 10 MB. Es privado: solo lo ve quien revisa, nunca los clientes.
            </p>
          </div>

          @if (uploading(); as up) {
            <div role="status" aria-live="polite">
              <div class="flex justify-between text-[13px] font-medium"><span>{{ phaseText() }}</span><span class="tabular-nums">{{ up.progress }}%</span></div>
              <div class="mt-1.5 h-1.5 overflow-hidden rounded-full bg-track" role="progressbar" aria-label="Subida del documento" [attr.aria-valuenow]="up.progress" aria-valuemin="0" aria-valuemax="100">
                <div class="h-full rounded-full bg-brand transition-[width] duration-150" [style.width.%]="up.progress"></div>
              </div>
            </div>
          }
          @if (error(); as err) {
            <p #errorBox tabindex="-1" class="rounded-xl bg-danger-soft px-3.5 py-2.5 text-[14px] font-medium text-danger outline-none" role="alert">{{ err }}</p>
          }

          <div class="flex flex-wrap gap-2">
            <button type="submit" class="flex h-12 items-center gap-2 rounded-xl bg-brand px-5 text-[15px] font-bold text-white hover:bg-brand-dark disabled:opacity-60" [disabled]="!!uploading()" [attr.aria-busy]="!!uploading()">
              @if (uploading()) { <span class="size-4 animate-spin rounded-full border-[2.5px] border-white/35 border-t-white" aria-hidden="true"></span>Enviando… } @else { Enviar a revisión }
            </button>
            <button type="button" class="h-12 rounded-xl px-4 text-[15px] font-semibold text-ink-soft hover:bg-sand disabled:opacity-55" [disabled]="!!uploading()" (click)="open.set(false)">Cancelar</button>
          </div>
        </form>
      }
    </article>
  `,
})
export class LicenseCard {
  protected readonly store = inject(ProStore);
  readonly service = input.required<OfferedService>();
  /** Envíos de este servicio, el más reciente primero. */
  readonly history = input<OwnVerification[]>([]);

  protected readonly accept = DOCUMENT_ACCEPT;
  protected readonly tomorrow = localIsoDate(new Date(Date.now() + 86_400_000));
  protected readonly date = formatTimestamp;

  protected readonly open = signal(false);
  protected readonly reference = signal('');
  protected readonly expiresAt = signal('');
  private readonly file = signal<File | null>(null);
  private readonly localError = signal<string | null>(null);

  private readonly refInput = viewChild<ElementRef<HTMLInputElement>>('refInput');
  private readonly errorBox = viewChild<ElementRef<HTMLElement>>('errorBox');

  protected readonly latest = computed(() => this.history()[0] ?? null);
  protected readonly status = computed(() => LICENSE_UI[this.service().licenseStatus as keyof typeof LICENSE_UI]);
  protected readonly toneText = computed(() =>
    ({ ok: 'text-brand', pending: 'text-accent-ink', danger: 'text-danger', neutral: 'text-ink' })[this.status().tone],
  );
  protected readonly uploading = computed(() => {
    const up = this.store.licenseUpload();
    return up && up.serviceId === this.service().id ? up : null;
  });
  protected readonly phaseText = computed(() =>
    ({ signing: 'Preparando…', uploading: 'Subiendo documento…', saving: 'Enviando a revisión…' })[this.uploading()?.phase ?? 'signing'],
  );
  protected readonly error = computed(() => {
    const e = this.store.licenseError();
    return this.localError() ?? (e && e.serviceId === this.service().id ? e.message : null);
  });

  protected start(): void {
    this.reference.set(this.latest()?.reference ?? '');
    this.expiresAt.set('');
    this.file.set(null);
    this.localError.set(null);
    this.open.set(true);
    setTimeout(() => this.refInput()?.nativeElement.focus());
  }

  protected pick(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0] ?? null;
    this.file.set(file);
    this.localError.set(file ? documentProblem(file) : null);
  }

  protected async send(): Promise<void> {
    this.localError.set(null);
    const ok = await this.store.submitLicense(this.service().id, {
      file: this.file(),
      reference: this.reference(),
      expiresAt: this.expiresAt() || null,
    });
    if (ok) this.open.set(false);
    else setTimeout(() => this.errorBox()?.nativeElement.focus());
  }
}
