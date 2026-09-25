import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  DestroyRef,
  ElementRef,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  viewChild,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { RequestStore } from '../../../../core/state/request.store';
import { SearchStore } from '../../../../core/state/search.store';
import { avatarOf } from '../../../../core/models/avatar';
import { ProfessionalSummary } from '../../../../core/models/professional';
import { professionalSubtitle } from '../result-card/result-card';
import { Avatar } from '../../../../shared/components/avatar/avatar';
import { Icon } from '../../../../shared/components/icon/icon';

/**
 * Comparador de profesionales.
 * Desktop: modal centrado en el viewport con scroll interno.
 * Mobile: diálogo a pantalla completa con tarjetas deslizables.
 */
@Component({
  selector: 'app-compare-dialog',
  imports: [RouterLink, Avatar, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown.escape)': 'close()',
    '(document:keydown.tab)': 'trapFocus($any($event))',
  },
  templateUrl: './compare-dialog.html',
})
export class CompareDialog {
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  protected readonly search = inject(SearchStore);
  protected readonly request = inject(RequestStore);

  private readonly closeDesktop = viewChild<ElementRef<HTMLButtonElement>>('closeDesktop');
  private readonly closeMobile = viewChild<ElementRef<HTMLButtonElement>>('closeMobile');

  protected readonly open = this.search.compareOpen;
  protected readonly selected = computed(() =>
    this.search.selected().map((p) => ({ ...p, avatar: avatarOf(p), subtitle: professionalSubtitle(p) })),
  );
  protected readonly rows = this.search.compareRows;
  protected readonly columns = computed(
    () => `170px repeat(${Math.max(this.selected().length, 1)}, minmax(0, 1fr))`,
  );
  protected readonly askLabel = computed(() => {
    const n = this.selected().length;
    return n === 1 ? 'Pedir presupuesto' : `Pedir presupuesto a los ${n}`;
  });

  /** Elemento que abrió el diálogo, para devolverle el foco al cerrar. */
  private opener: HTMLElement | null = null;

  constructor() {
    // Bloquea el scroll del body, enfoca "Cerrar" al abrir y devuelve el foco al cerrar.
    effect(() => {
      if (!this.isBrowser) return;
      const isOpen = this.open();
      this.document.body.style.overflow = isOpen ? 'hidden' : '';
      if (isOpen) {
        this.opener = this.document.activeElement as HTMLElement | null;
        queueMicrotask(() => this.visibleClose()?.focus());
      } else if (this.opener) {
        const opener = this.opener;
        this.opener = null;
        queueMicrotask(() => opener.isConnected && opener.focus());
      }
    });
    inject(DestroyRef).onDestroy(() => {
      if (this.isBrowser) this.document.body.style.overflow = '';
      this.search.closeCompare();
    });
  }

  /** Mantiene el Tab dentro del diálogo visible (desktop o mobile). */
  protected trapFocus(event: KeyboardEvent): void {
    if (!this.open()) return;
    const dialog = this.visibleClose()?.closest<HTMLElement>('[role="dialog"]');
    if (!dialog) return;
    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'),
    ).filter((el) => el.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = this.document.activeElement;
    if (event.shiftKey && (active === first || !dialog.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  }

  private visibleClose(): HTMLButtonElement | undefined {
    const desktop = this.closeDesktop()?.nativeElement;
    return desktop && desktop.offsetParent ? desktop : this.closeMobile()?.nativeElement;
  }

  protected close(): void {
    if (this.open()) this.search.closeCompare();
  }

  protected askAll(): void {
    this.request.askProfessionals(this.search.selected());
    this.search.closeCompare();
    this.router.navigate(['/presupuesto']);
  }

  protected ask(pro: ProfessionalSummary): void {
    this.request.askProfessionals([pro]);
    this.search.closeCompare();
    this.router.navigate(['/presupuesto']);
  }

  protected view(): void {
    this.search.closeCompare();
  }
}
