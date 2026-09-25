import { Routes } from '@angular/router';
import { ClientShell } from './layout/client-shell/client-shell';
import { ProShell } from './layout/pro-shell/pro-shell';

/**
 * `data.mobileNav`:
 *  - true                → muestra la barra inferior en mobile/tablet
 *  - 'unless-selection'  → la oculta cuando hay profesionales seleccionados
 *  - (ausente)           → pantallas de flujo con su propio CTA fijo
 */
export const routes: Routes = [
  {
    path: '',
    component: ClientShell,
    children: [
      {
        path: '',
        title: 'Resuelve · ¿Qué necesitás resolver?',
        data: { mobileNav: true },
        loadComponent: () => import('./features/client/home/home-page').then((m) => m.HomePage),
      },
      {
        path: 'solicitud',
        title: 'Crear solicitud · Resuelve',
        loadComponent: () =>
          import('./features/client/request-flow/request-flow-page').then((m) => m.RequestFlowPage),
      },
      {
        path: 'profesionales',
        title: 'Profesionales disponibles · Resuelve',
        data: { mobileNav: 'unless-selection' },
        loadComponent: () => import('./features/client/results/results-page').then((m) => m.ResultsPage),
      },
      {
        path: 'servicios',
        title: 'Todos los servicios · Resuelve',
        data: { mobileNav: true },
        loadComponent: () => import('./features/client/services/services-page').then((m) => m.ServicesPage),
      },
      {
        path: 'profesional/:id',
        title: 'Perfil del profesional · Resuelve',
        loadComponent: () =>
          import('./features/client/professional-profile/professional-profile-page').then(
            (m) => m.ProfessionalProfilePage,
          ),
      },
      {
        path: 'presupuesto',
        title: 'Solicitar presupuesto · Resuelve',
        loadComponent: () =>
          import('./features/client/quote-request/quote-request-page').then((m) => m.QuoteRequestPage),
      },
      {
        path: 'presupuesto/enviado',
        title: 'Solicitud enviada · Resuelve',
        loadComponent: () =>
          import('./features/client/quote-request/quote-sent-page').then((m) => m.QuoteSentPage),
      },
      {
        path: 'mis-solicitudes',
        title: 'Mis solicitudes · Resuelve',
        data: { mobileNav: true },
        loadComponent: () =>
          import('./features/client/my-requests/my-requests-page').then((m) => m.MyRequestsPage),
      },
      {
        path: 'urgencias',
        title: 'Urgencias · Resuelve',
        data: { mobileNav: true },
        loadComponent: () => import('./features/client/urgent/urgent-page').then((m) => m.UrgentPage),
      },
      {
        path: 'perfil',
        title: 'Mi perfil · Resuelve',
        data: { mobileNav: true },
        loadComponent: () =>
          import('./features/client/client-profile/client-profile-page').then((m) => m.ClientProfilePage),
      },
    ],
  },
  {
    path: 'pro',
    component: ProShell,
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        title: 'Inicio · Resuelve Pro',
        data: { mobileNav: true },
        loadComponent: () =>
          import('./features/pro/dashboard/pro-dashboard-page').then((m) => m.ProDashboardPage),
      },
      {
        path: 'solicitudes',
        title: 'Solicitudes · Resuelve Pro',
        data: { mobileNav: true },
        loadComponent: () =>
          import('./features/pro/requests/pro-requests-page').then((m) => m.ProRequestsPage),
      },
      {
        path: 'solicitudes/:id',
        title: 'Detalle de solicitud · Resuelve Pro',
        loadComponent: () =>
          import('./features/pro/request-detail/pro-request-detail-page').then(
            (m) => m.ProRequestDetailPage,
          ),
      },
      {
        path: 'solicitudes/:id/presupuesto',
        title: 'Crear presupuesto · Resuelve Pro',
        loadComponent: () =>
          import('./features/pro/quote-builder/pro-quote-page').then((m) => m.ProQuotePage),
      },
      {
        path: 'agenda',
        title: 'Agenda · Resuelve Pro',
        data: { mobileNav: true },
        loadComponent: () => import('./features/pro/agenda/pro-agenda-page').then((m) => m.ProAgendaPage),
      },
      {
        path: 'estadisticas',
        title: 'Tu mes · Resuelve Pro',
        loadComponent: () => import('./features/pro/stats/pro-stats-page').then((m) => m.ProStatsPage),
      },
      {
        path: 'perfil',
        title: 'Perfil y configuración · Resuelve Pro',
        data: { mobileNav: true },
        loadComponent: () =>
          import('./features/pro/profile/pro-profile-page').then((m) => m.ProProfilePage),
      },
      {
        path: 'plan',
        title: 'Planes · Resuelve Pro',
        loadComponent: () => import('./features/pro/plans/pro-plans-page').then((m) => m.ProPlansPage),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
