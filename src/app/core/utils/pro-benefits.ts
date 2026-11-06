/** Copy comercial compartido. Describe las reglas existentes, no determina acceso ni cupo. */
export const PRO_RESPONSE_BENEFIT = 'Respondé todos los pedidos de búsqueda, sin el cupo de Free';
export const PRO_EARLY_ACCESS = 'Acceso anticipado cuando el mismo pedido también llega a un Free con espera. Los pedidos de hoy, urgentes y dirigidos no tienen demora.';
export const FREE_DIRECT_REQUESTS = 'Los pedidos dirigidos a vos, WhatsApp y llamadas no consumen oportunidades Free.';

/**
 * PRO en tres líneas, para cualquiera (única fuente: Mi plan y /trabaja-con-resuelve).
 * Sin jerga ni promesas de posición: «aparecés destacado» = espacios Destacados rotulados.
 * `freeLimit`: cupo Free real de GET /plans (null = sin límite, undefined = todavía no se sabe).
 */
export function proThreeLines(freeLimit: number | null | undefined): string[] {
  const free = typeof freeLimit === 'number' ? ` (con Gratis, ${freeLimit} en total)` : '';
  return [
    'Aparecés destacado cuando te buscan en tu zona.',
    `Respondés todos los pedidos de presupuesto${free}.`,
    'Mostrás tus trabajos con fotos, en tu perfil y en la búsqueda.',
  ];
}
