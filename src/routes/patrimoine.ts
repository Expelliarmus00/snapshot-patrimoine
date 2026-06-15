import type { FastifyPluginAsync } from 'fastify';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { prisma } from '../db/client.js';
import { config } from '../config.js';

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
      return reply.code(409).send({ error: 'identifiant déjà présent' });
    }
  });

  app.delete('/historique/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    await prisma.historique.deleteMany({ where: { id } });
    return reply.code(204).send();
  });

  // Téléchargement de la base de données (backup manuel, authentifié)
  app.get('/backup', async (request, reply) => {
    const dbUrl = config.DATABASE_URL.replace(/^file:/, '');
    const dbPath = path.resolve(process.cwd(), dbUrl);
    try {
      await stat(dbPath);
    } catch {
      return reply.code(404).send({ error: 'database file not found' });
    }
    const filename = `patrimoine-backup-${new Date().toISOString().slice(0, 10)}.db`;
    reply.header('Content-Disposition', `attachment; filename="${filename}"`);
    reply.header('Content-Type', 'application/octet-stream');
    return reply.send(createReadStream(dbPath));
  });
};
