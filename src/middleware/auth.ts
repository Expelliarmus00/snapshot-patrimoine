import type { FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../config.js';

/**
 * Middleware d'auth pour snapshot-patrimoine.
 * Lit le cookie brut depuis les headers et appelle le dashboard pour valider.
 * Si valide → met request.user ; sinon → redirect vers le dashboard (magic-link).
 */
export async function authMiddleware(request: FastifyRequest, reply: FastifyReply) {
  const rawCookie = request.headers.cookie || '';

  try {
    const res = await fetch(`${config.DASHBOARD_URL}/api/auth/validate`, {
      headers: { cookie: rawCookie },
    });

    if (!res.ok) {
      return reply.redirect(config.DASHBOARD_URL);
    }

    const data = (await res.json()) as { valid: boolean; user?: { id: string; email: string } };

    if (!data.valid || !data.user) {
      return reply.redirect(config.DASHBOARD_URL);
    }

    request.user = data.user;
  } catch (err) {
    request.log.error({ err }, 'auth: failed to validate session with dashboard');
    return reply.redirect(config.DASHBOARD_URL);
  }
}
