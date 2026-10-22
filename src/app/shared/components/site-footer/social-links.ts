import { IconName } from '../icon/icon';

/**
 * Cuentas oficiales de Resuelve en redes (única fuente del front). Las mismas URLs van en `sameAs` del JSON-LD de
 * `src/index.html`: si cambian, cambiarlas en los dos. Son enlaces comunes: no cargamos SDKs, píxeles ni widgets de las redes.
 */
export const SOCIAL_LINKS: readonly { network: string; icon: IconName; url: string }[] = [
  { network: 'Instagram', icon: 'instagram', url: 'https://www.instagram.com/resuelve.ar.app/' },
  { network: 'Facebook', icon: 'facebook', url: 'https://www.facebook.com/profile.php?id=61594907862290' },
];
