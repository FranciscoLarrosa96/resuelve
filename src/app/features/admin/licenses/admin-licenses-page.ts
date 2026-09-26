import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Meta } from '@angular/platform-browser';
import { Router, RouterLink } from '@angular/router';
import {
  AdminListView,
  AdminVerification,
  DOCUMENT_LINK_MINUTES,
  REJECTION_REASON_LIMITS,
} from '../../../core/models/admin';
import { VerificationStatus } from '../../../core/models/pro-profile';
import { ToastService } from '../../../core/services/toast.service';
import { AdminLicensesStore } from '../../../core/state/admin-licenses.store';
import { formatTimestamp, localIsoDate } from '../../../core/utils/dates';
import { Dialog } from '../../../shared/components/dialog/dialog';
import { Icon } from '../../../shared/components/icon/icon';
import { Logo } from '../../../shared/components/logo/logo';

/**
 * Dónde se verifica cada matrícula, por slug del servicio. Es solo una ayuda
 * para quien revisa: qué servicios exigen matrícula lo decide `requiresLicense`.
 */
export const REGISTRY_HINTS: Record<string, string> = {
  gas: 'Buscá el número en el registro de gasistas matriculados de Camuzzi Gas Pampeana, la distribuidora de Tandil.',
  electricidad:
    'Todavía no definimos el registro oficial de electricistas para Tandil. Si no podés confirmar el número, pedile al profesional un comprobante antes de aprobar.',
};
const DEFAULT_HINT = 'Buscá el número en el registro oficial del servicio.';

/** Motivos frecuentes: completan el campo, que se puede editar antes de enviar. */
export const QUICK_REASONS = [
  'El número no figura en el registro oficial.',
  'La matrícula figura como vencida en el registro.',
  'El nombre del registro no coincide con el de tu perfil.',
] as const;

export const STATUS_UI: Record<VerificationStatus, { label: string; tone: string }> = {
  PENDING: { label: 'Para revisar', tone: 'bg-accent-soft text-accent-ink' },
  VERIFIED: { label: 'Aprobada', tone: 'bg-brand-soft text-brand-dark' },
  REJECTED: { label: 'Rechazada', tone: 'bg-danger-soft text-danger' },
  EXPIRED: { label: 'Vencida', tone: 'bg-neutral-soft text-neutral' },
};

/**
 * /admin/matriculas: bandeja de matrículas para revisar y su detalle.
 * Desktop: lista y detalle lado a lado. Mobile: la lista o el detalle.
 * Después de cada decisión abre la siguiente pendiente.
 */
@Component({
  selector: 'app-admin-licenses-page',
  imports: [RouterLink, Dialog, Icon, Logo],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './admin-licenses-page.html',
})
export class AdminLicensesPage {
  protected readonly store = inject(AdminLicensesStore);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  /** Parámetro de ruta (withComponentInputBinding). */
  readonly id = input<string | undefined>(undefined);
  /** ?vista=revisadas */
  readonly vista = input<string | undefined>(undefined);

  protected readonly view = computed<AdminListView>(() => (this.vista() === 'revisadas' ? 'reviewed' : 'pending'));
  protected readonly viewParams = computed(() => (this.view() === 'reviewed' ? { vista: 'revisadas' } : {}));
  protected readonly selected = computed(() => {
    const d = this.store.detail();
    return d && d.item.id === this.id() ? d : null;
  });

  protected readonly date = formatTimestamp;
  protected readonly statusUi = STATUS_UI;
  protected readonly quickReasons = QUICK_REASONS;
  protected readonly limits = REJECTION_REASON_LIMITS;
  protected readonly linkMinutes = DOCUMENT_LINK_MINUTES;
  protected readonly tomorrow = localIsoDate(new Date(Date.now() + 86_400_000));

  protected readonly approving = signal(false);
  protected readonly expiresAt = signal('');
  protected readonly rejecting = signal(false);
  protected readonly reason = signal('');
  protected readonly purging = signal(false);

  protected readonly reasonLength = computed(() => this.reason().trim().length);
  protected readonly reasonValid = computed(
    () => this.reasonLength() >= this.limits.min && this.reasonLength() <= this.limits.max,
  );
  protected readonly reasonTouched = signal(false);

  private readonly detailHeading = viewChild<ElementRef<HTMLElement>>('detailHeading');
  private readonly reasonInput = viewChild<ElementRef<HTMLTextAreaElement>>('reasonInput');

  constructor() {
    // Nunca indexar el panel, aunque alguien comparta el link.
    inject(Meta).updateTag({ name: 'robots', content: 'noindex, nofollow' });

    effect(() => {
      const view = this.view();
      if (this.browser) untracked(() => void this.store.loadList(view));
    });
    effect(() => {
      const id = this.id();
      if (!this.browser) return;
      untracked(() => {
        if (id) void this.store.open(id).then(() => this.focusDetail());
        else this.store.close();
      });
    });
  }

  protected hint(item: AdminVerification): string {
    return (item.serviceSlug && REGISTRY_HINTS[item.serviceSlug]) || DEFAULT_HINT;
  }

  protected size(bytes: number | null): string {
    if (!bytes) return '';
    return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
  }

  protected async copy(reference: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(reference);
      this.toast.show('Número copiado.');
    } catch {
      this.toast.show('No pudimos copiar. Seleccioná el número a mano.', 3200, 'info');
    }
  }

  // ---- Aprobar ---------------------------------------------------------------

  protected openApprove(): void {
    this.expiresAt.set('');
    this.store.actionError.set(null);
    this.approving.set(true);
  }

  protected closeApprove(): void {
    if (!this.store.acting()) this.approving.set(false);
  }

  protected async confirmApprove(item: AdminVerification): Promise<void> {
    const next = this.store.nextPendingAfter(item.id);
    const ok = await this.store.approve(item.id, this.expiresAt() || null);
    this.approving.set(false);
    if (ok) this.afterDecision(next, 'Matrícula aprobada. Ya aparece en las búsquedas.');
  }

  // ---- Rechazar --------------------------------------------------------------

  protected openReject(): void {
    this.reason.set('');
    this.reasonTouched.set(false);
    this.store.actionError.set(null);
    this.rejecting.set(true);
    setTimeout(() => this.reasonInput()?.nativeElement.focus());
  }

  protected closeReject(): void {
    if (!this.store.acting()) this.rejecting.set(false);
  }

  protected useReason(text: string): void {
    this.reason.set(text);
    this.reasonTouched.set(true);
    this.reasonInput()?.nativeElement.focus();
  }

  protected async confirmReject(item: AdminVerification): Promise<void> {
    this.reasonTouched.set(true);
    if (!this.reasonValid()) {
      this.reasonInput()?.nativeElement.focus();
      return;
    }
    const next = this.store.nextPendingAfter(item.id);
    const ok = await this.store.reject(item.id, this.reason());
    this.rejecting.set(false);
    if (ok) this.afterDecision(next, 'Matrícula rechazada. El profesional ya ve el motivo.');
  }

  // ---- Borrar documento ------------------------------------------------------

  protected closePurge(): void {
    if (!this.store.acting()) this.purging.set(false);
  }

  protected async confirmPurge(item: AdminVerification): Promise<void> {
    const ok = await this.store.purgeDocument(item.id);
    this.purging.set(false);
    if (ok) this.toast.show('Documento borrado. Los datos de la revisión quedan.');
  }

  /** Revisar de corrido: pasa a la siguiente pendiente (o vuelve a la lista vacía). */
  private afterDecision(next: string | null, message: string): void {
    this.toast.show(message, 3200);
    if (!this.store.isPendingView()) return;
    void this.router.navigate(next ? ['/admin/matriculas', next] : ['/admin/matriculas']);
  }

  private focusDetail(): void {
    // Al abrir desde la lista (sobre todo en mobile) el foco va al título del detalle.
    setTimeout(() => this.detailHeading()?.nativeElement.focus({ preventScroll: false }));
  }
}
