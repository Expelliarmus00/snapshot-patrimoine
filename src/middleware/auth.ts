import type { FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../config.js';

/**
 * Middleware d'auth pour snapshot-patrimoine.
 * Lit le cookie brut depuis les headers et appelle le dashboard pour valider.
 * Si valide → met request.user ; sinon → renvoie 401 (le front intercepte et redirige vers le dashboard).
 */
export async function authMiddleware(request: FastifyRequest, reply: FastifyReply) {
  const rawCookie = request.headers.cookie || '';

  try {
    const res = await fetch(`${config.DASHBOARD_URL}/api/auth/validate`, {
      headers: { cookie: rawCookie },
    });

    if (!res.ok) {
      return reply.code(401).send({ error: 'unauthenticated' });
    }

    const data = (await res.json()) as { valid: boolean; user?: { id: string; email: string } };

    if (!data.valid || !data.user) {
      return reply.code(401).send({ error: 'unauthenticated' });
    }

    request.user = data.user;
  } catch (err) {
    request.log.error({ err }, 'auth: failed to validate session with dashboard');
    return reply.code(401).send({ error: 'unauthenticated' });
  }
}
