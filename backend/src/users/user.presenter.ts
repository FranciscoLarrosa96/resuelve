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
    emailVerifiedAt: user.emailVerifiedAt,
    emailVerified: user.emailVerifiedAt !== null,
    /** La foto de perfil profesional, si tiene; si no, la de la cuenta (hoy siempre null). */
    avatarUrl: profile?.avatarUrl ?? user.avatarUrl,
    emailNotifications: user.emailNotifications,
    defaultZoneId: user.defaultZoneId,
    /** Ciudad que eligió para buscar (no es su domicilio). La UI la usa si no hay otra en la URL. */
    preferredLocality: user.preferredCity
      ? {
          id: user.preferredCity.id,
          name: user.preferredCity.name,
          slug: user.preferredCity.slug,
          province: user.preferredCity.provinceRef
            ? { name: user.preferredCity.provinceRef.name, slug: user.preferredCity.provinceRef.slug }
            : null,
        }
      : null,
    professionalProfileId: profile?.id ?? null,
    /** Solo habilita la ruta del panel en el frontend; el backend vuelve a chequearlo en cada pedido. */
    isAdmin: user.isAdmin,
    createdAt: user.createdAt,
  };
}
