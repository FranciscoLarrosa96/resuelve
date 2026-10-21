/** Espejo de `founderAwarePrice` del backend: el menor entre el precio fundador y el vigente. Solo para mostrar. */
export const founderAwarePrice = (currentPriceArs: number, founderPriceArs: number | null | undefined): number =>
  founderPriceArs != null && founderPriceArs > 0 ? Math.min(currentPriceArs, founderPriceArs) : currentPriceArs;
