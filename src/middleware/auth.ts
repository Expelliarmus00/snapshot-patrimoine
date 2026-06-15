import type { FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../config.js';

// Cache de session en mémoire (évite un appel réseau dashboard à chaque requête API).
// Clé = valeur du cookie snapshot_session. TTL = 5 minutes.
const sessionCache = new Map<string, { user: { id: string; email: string }; exp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

function extractSessionToken(rawCookie: string): string | null {
  for (const part of rawCookie.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === 'snapshot_session') return part.slice(eq + 1).trim();
  }
  return null;
}

function cacheGet(token: string): { id: string; email: string } | null {
  const entry = sessionCache.get(token);
  if (!entry) return null;
  if (Date.now() > entry.exp) { sessionCache.delete(token); return null; }
  return entry.user;
}

function cacheSet(token: string, user: { id: string; email: string }): void {
  if (sessionCache.size > 500) sessionCache.clear(); // borne de sécurité
  sessionCache.set(token, { user, exp: Date.now() + CACHE_TTL_MS });
}

const allowedEmails: Set<string> | null = config.ALLOWED_EMAILS
  ? new Set(config.ALLOWED_EMAILS.split(',').map(e => e.trim().toLowerCase()).filter(Boolean))
  : null;

export async function authMiddleware(request: FastifyRequest, reply: FastifyReply) {
  const rawCookie = request.headers.cookie || '';
  const token = extractSessionToken(rawCookie);

  // Essai du cache d'abord
  if (token) {
    const cached = cacheGet(token);
    if (cached) {
      if (allowedEmails && !allowedEmails.has(cached.email.toLowerCase())) {
        return reply.code(403).send({ error: 'forbidden' });
      }
      request.user = cached;
      return;
    }
  }

  try {
    const res = await fetch(`${config.DASHBOARD_URL}/api/auth/validate`, {
      headers: { cookie: rawCookie },
    });
    if (!res.ok) return reply.code(401).send({ error: 'unauthenticated' });

    const data = (await res.json()) as { valid: boolean; user?: { id: string; email: string } };
    if (!data.valid || !data.user) return reply.code(401).send({ error: 'unauthenticated' });

    if (allowedEmails && !allowedEmails.has(data.user.email.toLowerCase())) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    if (token) cacheSet(token, data.user);
    request.user = data.user;
  } catch (err) {
    request.log.error({ err }, 'auth: failed to validate session with dashboard');
    return reply.code(401).send({ error: 'unauthenticated' });
  }
}
