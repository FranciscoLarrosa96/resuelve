import type { ProfessionalProfile } from '../professionals/professional-profile.entity';
import type { User } from './user.entity';

/** Datos propios del usuario autenticado. Nunca incluye passwordHash. */
export function presentMe(user: User, profile: ProfessionalProfile | null) {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    phone: user.phone,
    phoneVerified: user.phoneVerified,
    avatarUrl: user.avatarUrl,
    defaultZoneId: user.defaultZoneId,
    professionalProfileId: profile?.id ?? null,
    /** Solo habilita la ruta del panel en el frontend; el backend vuelve a chequearlo en cada pedido. */
    isAdmin: user.isAdmin,
    createdAt: user.createdAt,
  };
}
