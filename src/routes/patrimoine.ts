import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db/client.js';

const CONFIG_ID = 1;

const HistoriqueSchema = z.object({
  id: z.string().min(1),
  date: z.string().min(1),
  contratId: z.string().min(1),
  valeur: z.coerce.number().default(0),
});

async function getConfig(): Promise<Record<string, unknown>> {
  const row = await prisma.patrimoineConfig.findUnique({ where: { id: CONFIG_ID } });
  return row ? (JSON.parse(row.json) as Record<string, unknown>) : {};
}

async function getHistorique() {
  return prisma.historique.findMany({
    orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, date: true, contratId: true, valeur: true },
  });
}

/**
 * API du dashboard patrimoine.
 * Montée sous /api/ et protégée par le middleware d'auth.
 *
 *   GET    /state           → config + historique 3a
 *   PUT    /config          → sauvegarde de la configuration (auto)
 *   POST   /historique      → ajout d'une valeur 3a (append-only)
 *   DELETE /historique/:id  → suppression explicite
 */
export const patrimoineRoutes: FastifyPluginAsync = async (app) => {
  app.get('/state', async (request) => {
    const [cfg, historique] = await Promise.all([getConfig(), getHistorique()]);
    return { ...cfg, historique, _auth: true, _user: request.user };
  });

  app.put('/config', async (request, reply) => {
    const body = { ...((request.body as Record<string, unknown>) || {}) };
    delete body.historique;
    delete body._auth;
    delete body._user;
    await prisma.patrimoineConfig.upsert({
      where: { id: CONFIG_ID },
      create: { id: CONFIG_ID, json: JSON.stringify(body) },
      update: { json: JSON.stringify(body) },
    });
    return reply.code(204).send();
  });

  app.post('/historique', async (request, reply) => {
    const parsed = HistoriqueSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'champs requis manquants' });
    }
    const { id, date, contratId, valeur } = parsed.data;
    try {
      await prisma.historique.create({ data: { id, date, contratId, valeur } });
      return reply.code(201).send({ id, date, contratId, valeur });
    } catch {
      // Clé primaire déjà présente → jamais d'écrasement (append-only).
      return reply.code(409).send({ error: 'identifiant déjà présent' });
    }
  });

  app.delete('/historique/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    await prisma.historique.deleteMany({ where: { id } });
    return reply.code(204).send();
  });
};
