import { Routes } from '@angular/router';
import { authGuard, guestGuard, onboardingGuard, professionalGuard } from './core/auth/auth.guard';
import { ClientShell } from './layout/client-shell/client-shell';
import { ProShell } from './layout/pro-shell/pro-shell';

/**
 * `data.mobileNav`:
 *  - true                → muestra la barra inferior en mobile/tablet
 *  - 'unless-selection'  → la oculta cuando hay profesionales seleccionados
 *  - (ausente)           → pantallas de flujo con su propio CTA fijo
 * `data.requiresAuth`: pantalla personal (authGuard). Si la sesión vence
 * estando ahí, se redirige a /ingresar.
 *
 * `data.proDemo`: pantalla del área pro que sigue siendo DEMO (muestra el aviso).
 * /pro/solicitudes… son reales: professionalGuard (sesión + ProfessionalProfile).
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
        canActivate: [authGuard],
        data: { mobileNav: true, requiresAuth: true },
        loadComponent: () =>
          import('./features/client/my-requests/my-requests-page').then((m) => m.MyRequestsPage),
      },
      {
        path: 'mis-solicitudes/:id',
        title: 'Detalle de solicitud · Resuelve',
        canActivate: [authGuard],
        data: { requiresAuth: true },
        loadComponent: () =>
          import('./features/client/my-requests/request-detail/request-detail-page').then((m) => m.RequestDetailPage),
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
        canActivate: [authGuard],
        data: { mobileNav: true, requiresAuth: true },
        loadComponent: () =>
          import('./features/client/client-profile/client-profile-page').then((m) => m.ClientProfilePage),
      },
      {
        path: 'soy-profesional',
        title: 'Creá tu perfil profesional · Resuelve',
        canActivate: [onboardingGuard],
        data: { requiresAuth: true },
        loadComponent: () =>
          import('./features/pro/onboarding/pro-onboarding-page').then((m) => m.ProOnboardingPage),
      },
      {
        path: 'ingresar',
        title: 'Ingresar · Resuelve',
        data: { mobileNav: true },
        canActivate: [guestGuard],
        loadComponent: () => import('./features/auth/login-page').then((m) => m.LoginPage),
      },
      {
        path: 'registro',
        title: 'Crear cuenta · Resuelve',
        data: { mobileNav: true },
        canActivate: [guestGuard],
        loadComponent: () => import('./features/auth/register-page').then((m) => m.RegisterPage),
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
        data: { mobileNav: true, proDemo: true },
        loadComponent: () =>
          import('./features/pro/dashboard/pro-dashboard-page').then((m) => m.ProDashboardPage),
      },
      {
        path: 'solicitudes',
        title: 'Solicitudes · Resuelve Pro',
        canActivate: [professionalGuard],
        data: { mobileNav: true, requiresAuth: true },
        loadComponent: () =>
          import('./features/pro/requests/pro-requests-page').then((m) => m.ProRequestsPage),
      },
      {
        path: 'solicitudes/:id',
        title: 'Detalle de solicitud · Resuelve Pro',
        canActivate: [professionalGuard],
        data: { requiresAuth: true },
        loadComponent: () =>
          import('./features/pro/request-detail/pro-request-detail-page').then(
            (m) => m.ProRequestDetailPage,
          ),
      },
      {
        path: 'solicitudes/:id/presupuesto',
        title: 'Crear presupuesto · Resuelve Pro',
        canActivate: [professionalGuard],
        data: { requiresAuth: true },
        loadComponent: () =>
          import('./features/pro/quote-builder/pro-quote-page').then((m) => m.ProQuotePage),
      },
      {
        path: 'agenda',
        title: 'Agenda · Resuelve Pro',
        data: { mobileNav: true, proDemo: true },
        loadComponent: () => import('./features/pro/agenda/pro-agenda-page').then((m) => m.ProAgendaPage),
      },
      {
        path: 'estadisticas',
        title: 'Tu mes · Resuelve Pro',
        data: { proDemo: true },
        loadComponent: () => import('./features/pro/stats/pro-stats-page').then((m) => m.ProStatsPage),
      },
      {
        path: 'perfil',
        title: 'Perfil y configuración · Resuelve Pro',
        data: { mobileNav: true, proDemo: true },
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
