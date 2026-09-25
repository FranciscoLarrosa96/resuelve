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
import { Professional } from '../../../../core/models/professional';
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
  host: { '(document:keydown.escape)': 'close()' },
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
  protected readonly selected = this.search.selected;
  protected readonly rows = this.search.compareRows;
  protected readonly columns = computed(
    () => `170px repeat(${Math.max(this.selected().length, 1)}, minmax(0, 1fr))`,
  );
  protected readonly askLabel = computed(() => {
    const n = this.selected().length;
    return n === 1 ? 'Pedir presupuesto' : `Pedir presupuesto a los ${n}`;
  });

  constructor() {
    // Bloquea el scroll del body y enfoca el botón de cerrar al abrir.
    effect(() => {
      if (!this.isBrowser) return;
      const isOpen = this.open();
      this.document.body.style.overflow = isOpen ? 'hidden' : '';
      if (isOpen) {
        queueMicrotask(() => {
          const desktop = this.closeDesktop()?.nativeElement;
          const target = desktop && desktop.offsetParent ? desktop : this.closeMobile()?.nativeElement;
          target?.focus();
        });
      }
    });
    inject(DestroyRef).onDestroy(() => {
      if (this.isBrowser) this.document.body.style.overflow = '';
      this.search.closeCompare();
    });
  }

  protected close(): void {
    if (this.open()) this.search.closeCompare();
  }

  protected askAll(): void {
    this.request.askProfessionals(this.search.selectedIds());
    this.search.closeCompare();
    this.router.navigate(['/presupuesto']);
  }

  protected ask(pro: Professional): void {
    this.request.askProfessionals([pro.id]);
    this.search.closeCompare();
    this.router.navigate(['/presupuesto']);
  }

  protected view(): void {
    this.search.closeCompare();
  }
}
