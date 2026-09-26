import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  // Rutas con parámetros: se renderizan en el cliente (datos de la API, en el navegador).
  { path: 'profesional/:id', renderMode: RenderMode.Client },
  { path: 'mis-solicitudes/:id', renderMode: RenderMode.Client },
  { path: 'pro/solicitudes/:id', renderMode: RenderMode.Client },
  { path: 'pro/solicitudes/:id/presupuesto', renderMode: RenderMode.Client },
  // Panel de admin: solo en el navegador (no se genera HTML estático del panel).
  { path: 'admin', renderMode: RenderMode.Client },
  { path: 'admin/**', renderMode: RenderMode.Client },
  // /perfil, /mis-solicitudes y /pro/solicitudes se prerenderizan como "Cargando tu sesión…" (sin datos):
  // la sesión solo existe en el navegador (ver authGuard).
  { path: '**', renderMode: RenderMode.Prerender },
];
