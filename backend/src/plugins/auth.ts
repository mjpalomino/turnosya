/**
 * Plugin de autenticación: registra @fastify/jwt y expone
 * `authenticate` (exige token válido) y `requireRole(...)` (control por rol).
 */
import fp from 'fastify-plugin';
import jwt from '@fastify/jwt';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../config.ts';
import type { Role } from '../types/auth.ts';

async function authPlugin(app: FastifyInstance): Promise<void> {
  await app.register(jwt, {
    secret: config.JWT_SECRET,
    sign: { expiresIn: '7d' },
  });

  app.decorate('authenticate', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      await req.jwtVerify();
    } catch {
      await reply.code(401).send({ error: 'No autenticado' });
    }
  });

  app.decorate('requireRole', (...roles: Role[]) => {
    return async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        await req.jwtVerify();
      } catch {
        await reply.code(401).send({ error: 'No autenticado' });
        return;
      }
      if (!roles.includes(req.user.role)) {
        await reply.code(403).send({ error: 'No autorizado' });
      }
    };
  });
}

export default fp(authPlugin, { name: 'auth' });
