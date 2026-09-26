import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { AuthUser } from '../../../core/models/auth';

/**
 * Avatar del usuario autenticado: `avatarUrl` si existe, si no sus
 * iniciales. Decorativo (el nombre siempre está al lado o en el label).
 */
@Component({
  selector: 'app-user-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class:
      'relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden bg-brand font-bold text-white',
    'aria-hidden': 'true',
  },
  template: `
    {{ initials() }}
    @if (user().avatarUrl && !failed()) {
      <img [src]="user().avatarUrl" alt="" class="absolute inset-0 size-full object-cover" (error)="failed.set(true)" />
    }
  `,
})
export class UserAvatar {
  readonly user = input.required<{ firstName: string; lastName: string; avatarUrl: AuthUser['avatarUrl'] }>();
  protected readonly failed = signal(false);
  protected readonly initials = computed(() => {
    const u = this.user();
    return `${u.firstName.charAt(0)}${u.lastName.charAt(0)}`.toUpperCase();
  });
}
