import { Routes } from '@angular/router';
import { roleGuard } from './core/role.guard';

/** Rutas con carga diferida (lazy) y guards por rol. */
export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'login' },

  // Públicas
  { path: 'login', loadComponent: () => import('./pages/login.page').then((m) => m.LoginPage) },
  { path: 'registro-negocio', loadComponent: () => import('./pages/register-business.page').then((m) => m.RegisterBusinessPage) },
  { path: 'sitio/:slug', loadComponent: () => import('./pages/public-site.page').then((m) => m.PublicSitePage) },
  { path: 'registro/:slug', loadComponent: () => import('./pages/register-customer.page').then((m) => m.RegisterCustomerPage) },
  { path: 'fidelizacion', loadComponent: () => import('./pages/loyalty-redeem.page').then((m) => m.LoyaltyRedeemPage) },

  // Cliente
  {
    path: 'mis-citas',
    canActivate: [roleGuard('customer')],
    loadComponent: () => import('./pages/customer-appointments.page').then((m) => m.CustomerAppointmentsPage),
  },
  // Empleado
  {
    path: 'mi-agenda',
    canActivate: [roleGuard('staff')],
    loadComponent: () => import('./pages/staff-agenda.page').then((m) => m.StaffAgendaPage),
  },
  // Dueño
  {
    path: 'panel',
    canActivate: [roleGuard('owner')],
    loadComponent: () => import('./pages/owner-panel.page').then((m) => m.OwnerPanelPage),
  },
  // Superadmin
  {
    path: 'admin',
    canActivate: [roleGuard('superadmin')],
    loadComponent: () => import('./pages/admin-panel.page').then((m) => m.AdminPanelPage),
  },

  { path: '**', redirectTo: 'login' },
];
