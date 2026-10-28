/** Inyecta el Bearer token en cada petición al API. */
import { HttpInterceptorFn } from '@angular/common/http';

const TOKEN_KEY = 'turnosya_token';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token && req.url.includes('/api/')) {
    req = req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
  }
  return next(req);
};
