/** Guard por rol: protege rutas de admin/owner/staff/cliente. Conserva el destino para volver tras el login. */
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import type { Role } from './models';

export function roleGuard(...roles: Role[]): CanActivateFn {
  return (_route, state) => {
    const auth = inject(AuthService);
    const router = inject(Router);
    const role = auth.role();
    if (role && roles.includes(role)) return true;
    return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
  };
}
