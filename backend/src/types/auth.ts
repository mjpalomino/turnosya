/** Tipos compartidos de autenticación. */

export type Role = 'superadmin' | 'owner' | 'staff' | 'customer';

/** Payload que viaja dentro del JWT. */
export interface AuthUser {
  id: string;
  role: Role;
  tenantId: string | null;
  email: string | null;
  fullName: string;
}

// Amplía los tipos de Fastify con nuestro usuario autenticado.
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: AuthUser;
    user: AuthUser;
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    /** Falla con 401 si no hay JWT válido. */
    authenticate: (req: import('fastify').FastifyRequest, reply: import('fastify').FastifyReply) => Promise<void>;
    /** Factory: exige que el rol esté en la lista dada. */
    requireRole: (
      ...roles: Role[]
    ) => (req: import('fastify').FastifyRequest, reply: import('fastify').FastifyReply) => Promise<void>;
  }
}
