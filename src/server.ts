import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { prisma } from './db/client.js';
import { authMiddleware } from './middleware/auth.js';
import { patrimoineRoutes } from './routes/patrimoine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, '../public');

const app = Fastify({
  logger: {
    level: config.NODE_ENV === 'development' ? 'debug' : 'info',
    transport:
      config.NODE_ENV === 'development'
        ? { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', colorize: true } }
        : undefined,
  },
  trustProxy: true,
});

await app.register(cors, {
  origin: config.APP_URL,
  credentials: true,
});

// Cookie en lecture seule (pas de secret — on ne signe pas ici, on forward au dashboard)
await app.register(cookie);

// Health check (public)
app.get('/health', async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: 'ok', db: 'ok', uptime: process.uptime() };
  } catch (err) {
    app.log.error({ err }, 'health: db check failed');
    return { status: 'degraded', db: 'error', uptime: process.uptime() };
  }
});

// Routes API protégées par authMiddleware (valide la session via le dashboard)
await app.register(
  async (instance) => {
    instance.addHook('preHandler', authMiddleware);
    await instance.register(patrimoineRoutes);
  },
  { prefix: '/api' },
);

// Front statique : l'app patrimoine
await app.register(fastifyStatic, {
  root: PUBLIC_DIR,
  index: ['index.html'],
});

// Toute route non-API inconnue → index.html (SPA)
app.setNotFoundHandler((request, reply) => {
  if (request.url.startsWith('/api/')) {
    return reply.code(404).send({ error: 'not_found' });
  }
  return reply.sendFile('index.html');
});

const start = async () => {
  try {
    await app.listen({ port: config.PORT, host: '0.0.0.0' });
    app.log.info(`Snapshot Patrimoine listening on :${config.PORT} (${config.NODE_ENV})`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

const shutdown = async (signal: string) => {
  app.log.info({ signal }, 'shutting down gracefully');
  await app.close();
  await prisma.$disconnect();
  process.exit(0);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

start();
