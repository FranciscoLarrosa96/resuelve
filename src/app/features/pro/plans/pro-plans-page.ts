import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthStore } from '../../../core/state/auth.store';
import { ProStore } from '../../../core/state/pro.store';

@Component({
  selector: 'app-pro-plans-page',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pro-plans-page.html',
})
export class ProPlansPage {
  protected readonly auth = inject(AuthStore);
  protected readonly store = inject(ProStore);
}
