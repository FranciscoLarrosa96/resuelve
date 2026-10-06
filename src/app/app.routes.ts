import { Routes } from '@angular/router';
import {
  adminGuard,
  authGuard,
  emailVerificationGuard,
  guestGuard,
  onboardingGuard,
  professionalGuard,
} from './core/auth/auth.guard';
import { ClientShell } from './layout/client-shell/client-shell';

/**
 * `data.mobileNav`:
 *  - true                → muestra la barra inferior en mobile/tablet
 *  - (ausente)           → pantallas de flujo con su propio CTA fijo
 * `data.requiresAuth`: pantalla personal (authGuard). Si la sesión vence
 * estando ahí, se redirige a /ingresar.
 *
 * TODO /pro/** exige sesión + ProfessionalProfile (professionalGuard): ninguna
 * pantalla del panel se ve sin sesión. Ya no quedan pantallas demo: "Tu mes"
 * (/pro/estadisticas) y Plan muestran datos y condiciones reales.
 */
export const routes: Routes = [
  {
    path: '',
    component: ClientShell,
    children: [
      {
        path: '',
        title: 'Resuelve · Profesionales de confianza en Tandil',
        data: {
          mobileNav: true,
          seo: {
            description:
              'Contanos qué necesitás resolver y recibí presupuestos de profesionales de Tandil: plomeros, electricistas, gasistas y más. Comparalos, elegí y coordiná el trabajo.',
          },
        },
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
        data: { mobileNav: true },
        loadComponent: () => import('./features/client/results/results-page').then((m) => m.ResultsPage),
      },
      {
        path: 'servicios',
        title: 'Todos los servicios en Tandil · Resuelve',
        data: {
          mobileNav: true,
          seo: {
            description:
              'Todos los servicios para el hogar que podés pedir en Tandil: electricidad, gas, plomería, cerrajería, pintura, aire acondicionado y más.',
          },
        },
        loadComponent: () => import('./features/client/services/services-page').then((m) => m.ServicesPage),
      },
      {
        // Página pública de un servicio ("Plomería en Tandil"). Los buscadores reciben el HTML de api/service-page.ts.
        path: 'servicios/:slug',
        data: { mobileNav: true, seo: {} }, // título y descripción los pone la propia página
        loadComponent: () => import('./features/client/services/service-landing-page').then((m) => m.ServiceLandingPage),
      },
      {
        path: 'p/:slug',
        data: { seo: 'profile' },
        loadComponent: () => import('./features/client/professional-profile/professional-profile-page').then(m => m.ProfessionalProfilePage),
      },
      {
        // Reseña de un cliente que el profesional invitó (QR o WhatsApp). Pública y sin registro: pantalla mínima, pensada para el celular.
        path: 'p/:slug/resenar',
        title: 'Dejá tu reseña · Resuelve',
        loadComponent: () =>
          import('./features/client/professional-profile/invited-review-page').then((m) => m.InvitedReviewPage),
      },
      {
        path: 'profesional/:id/resenar',
        title: 'Dejá tu reseña · Resuelve',
        loadComponent: () =>
          import('./features/client/professional-profile/invited-review-page').then((m) => m.InvitedReviewPage),
      },
      {
        path: 'profesional/:id',
        title: 'Perfil del profesional · Resuelve',
        data: { seo: 'profile' },
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
        path: 'mis-profesionales',
        title: 'Mis profesionales · Resuelve',
        canActivate: [authGuard],
        data: { mobileNav: true, requiresAuth: true },
        loadComponent: () =>
          import('./features/client/my-professionals/my-professionals-page').then((m) => m.MyProfessionalsPage),
      },
      {
        path: 'urgencias',
        title: 'Urgencias en Tandil · Resuelve',
        data: {
          mobileNav: true,
          seo: {
            description:
              'Una urgencia en casa en Tandil: contá qué pasó y pedí presupuesto a profesionales de la ciudad.',
          },
        },
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
        // Pública, sin login y prerenderizada.
        path: 'privacidad',
        title: 'Política de Privacidad | Resuelve',
        data: { seo: {} }, // la descripción la pone la propia página
        loadComponent: () => import('./features/legal/privacy-page').then((m) => m.PrivacyPage),
      },
      {
        // Pública, sin login y prerenderizada.
        path: 'terminos',
        title: 'Términos de Uso | Resuelve',
        data: { seo: {} }, // la descripción la pone la propia página
        loadComponent: () => import('./features/legal/terms-page').then((m) => m.TermsPage),
      },
      {
        path: 'ingresar',
        title: 'Ingresar · Resuelve',
        data: { mobileNav: true },
        canActivate: [guestGuard],
        loadComponent: () => import('./features/auth/login-page').then((m) => m.LoginPage),
      },
      {
        path: 'registro/profesional',
        canActivate: [guestGuard],
        loadComponent: () => import('./features/auth/register-page').then(m => m.RegisterPage),
      },
      {
        path: 'registro',
        title: 'Crear cuenta · Resuelve',
        data: { mobileNav: true },
        canActivate: [guestGuard],
        loadComponent: () => import('./features/auth/register-page').then((m) => m.RegisterPage),
      },
      {
        path: 'avisos/baja',
        title: 'Avisos por email · Resuelve',
        loadComponent: () =>
          import('./features/auth/email-unsubscribe-page').then((m) => m.EmailUnsubscribePage),
      },
      {
        path: 'verificar-email',
        title: 'Verificá tu email · Resuelve',
        data: { requiresAuth: true },
        canActivate: [emailVerificationGuard],
        loadComponent: () => import('./features/auth/verify-email-page').then((m) => m.VerifyEmailPage),
      },
    ],
  },
  {
    path: 'pro',
    // Lazy: el shell profesional (sidebar, store de solicitudes) no viaja en el bundle inicial de los clientes.
    loadComponent: () => import('./layout/pro-shell/pro-shell').then((m) => m.ProShell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        title: 'Inicio · Panel profesional',
        canActivate: [professionalGuard],
        data: { mobileNav: true, requiresAuth: true },
        loadComponent: () =>
          import('./features/pro/dashboard/pro-dashboard-page').then((m) => m.ProDashboardPage),
      },
      {
        path: 'solicitudes',
        title: 'Solicitudes · Panel profesional',
        canActivate: [professionalGuard],
        data: { mobileNav: true, requiresAuth: true },
        loadComponent: () =>
          import('./features/pro/requests/pro-requests-page').then((m) => m.ProRequestsPage),
      },
      {
        path: 'solicitudes/:id',
        title: 'Detalle de solicitud · Panel profesional',
        canActivate: [professionalGuard],
        data: { requiresAuth: true },
        loadComponent: () =>
          import('./features/pro/request-detail/pro-request-detail-page').then(
            (m) => m.ProRequestDetailPage,
          ),
      },
      {
        path: 'solicitudes/:id/presupuesto/:quoteId',
        title: 'Editar presupuesto · Panel profesional',
        canActivate: [professionalGuard],
        data: { requiresAuth: true },
        loadComponent: () =>
          import('./features/pro/quote-builder/pro-quote-page').then((m) => m.ProQuotePage),
      },
      {
        path: 'solicitudes/:id/presupuesto',
        title: 'Crear presupuesto · Panel profesional',
        canActivate: [professionalGuard],
        data: { requiresAuth: true },
        loadComponent: () =>
          import('./features/pro/quote-builder/pro-quote-page').then((m) => m.ProQuotePage),
      },
      {
        path: 'agenda',
        title: 'Agenda · Panel profesional',
        canActivate: [professionalGuard],
        data: { mobileNav: true, requiresAuth: true },
        loadComponent: () => import('./features/pro/agenda/pro-jobs-agenda-page').then((m) => m.ProJobsAgendaPage),
      },
      {
        path: 'trabajos/:id',
        title: 'Detalle del trabajo · Panel profesional',
        canActivate: [professionalGuard],
        data: { requiresAuth: true },
        loadComponent: () => import('./features/pro/jobs/pro-job-detail-page').then((m) => m.ProJobDetailPage),
      },
      {
        path: 'estadisticas',
        title: 'Tu mes · Panel profesional',
        canActivate: [professionalGuard],
        data: { requiresAuth: true },
        loadComponent: () => import('./features/pro/stats/pro-stats-page').then((m) => m.ProStatsPage),
      },
      {
        path: 'perfil',
        title: 'Mi perfil profesional · Panel profesional',
        canActivate: [professionalGuard],
        data: { mobileNav: true, requiresAuth: true },
        loadComponent: () =>
          import('./features/pro/profile/pro-profile-page').then((m) => m.ProProfilePage),
      },
      {
        path: 'plan',
        title: 'Mi plan · Panel profesional',
        canActivate: [professionalGuard],
        data: { requiresAuth: true },
        loadComponent: () => import('./features/pro/plans/pro-plans-page').then((m) => m.ProPlansPage),
      },
      {
        // Vuelta de Mercado Pago (MP_BACK_URL): confirma con el backend, nunca por el redirect.
        path: 'plan/resultado',
        title: 'Tu suscripción · Panel profesional',
        canActivate: [professionalGuard],
        data: { requiresAuth: true },
        loadComponent: () =>
          import('./features/pro/plans/pro-plan-result-page').then((m) => m.ProPlanResultPage),
      },
    ],
  },
  {
    // Panel de matrículas: sin shell de cliente ni de profesional y fuera de todo menú común.
    path: 'admin',
    canActivate: [adminGuard],
    data: { requiresAuth: true },
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'matriculas' },
      {
        path: 'matriculas',
        title: 'Matrículas · Admin Resuelve',
        loadComponent: () =>
          import('./features/admin/licenses/admin-licenses-page').then((m) => m.AdminLicensesPage),
      },
      {
        path: 'matriculas/:id',
        title: 'Revisar matrícula · Admin Resuelve',
        loadComponent: () =>
          import('./features/admin/licenses/admin-licenses-page').then((m) => m.AdminLicensesPage),
      },
      {
        path: 'reportes',
        title: 'Reportes · Admin Resuelve',
        loadComponent: () =>
          import('./features/admin/reports/admin-reports-page').then((m) => m.AdminReportsPage),
      },
      {
        path: 'precio',
        title: 'Precio de PRO · Admin Resuelve',
        loadComponent: () =>
          import('./features/admin/pricing/admin-pricing-page').then((m) => m.AdminPricingPage),
      },
    ],
  },
  {
    // Ruta inexistente: 404 real (con noindex), no un redirect silencioso al inicio.
    path: '**',
    component: ClientShell,
    children: [
      {
        path: '',
        title: 'Página no encontrada · Resuelve',
        loadComponent: () => import('./features/not-found/not-found-page').then((m) => m.NotFoundPage),
      },
    ],
  },
];
