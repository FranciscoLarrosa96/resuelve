import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  // Rutas con parámetros: se renderizan en el cliente (datos mock, sin backend).
  { path: 'profesional/:id', renderMode: RenderMode.Client },
  { path: 'pro/solicitudes/:id', renderMode: RenderMode.Client },
  { path: 'pro/solicitudes/:id/presupuesto', renderMode: RenderMode.Client },
  { path: '**', renderMode: RenderMode.Prerender },
];
