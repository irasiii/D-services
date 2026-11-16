import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { ZodError } from 'zod';
import type { Db } from './db.js';
import { HttpError } from './errors.js';
import { serviceRoutes } from './routes/services.js';
import { customerRoutes } from './routes/customers.js';
import { providerRoutes } from './routes/providers.js';
import { jobRoutes } from './routes/jobs.js';
import { chargeRoutes } from './routes/charges.js';

export interface AppOptions {
  db: Db;
  corsOrigins?: string[];
  logger?: boolean;
}

export async function buildApp(opts: AppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: opts.logger ?? false });
  await app.register(cors, { origin: opts.corsOrigins ?? false, methods: ['GET', 'POST', 'PUT', 'PATCH'] });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ZodError) {
      return reply.status(400).send({
        error: 'Invalid request',
        issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    if (err instanceof HttpError) {
      return reply.status(err.statusCode).send({ error: err.message });
    }
    const e = err as { code?: string; statusCode?: number; message?: string };
    if (e.code === '23505') return reply.status(409).send({ error: 'Already exists' });
    if (e.code === '23503') return reply.status(422).send({ error: 'Referenced record does not exist' });
    if (e.statusCode && e.statusCode >= 400 && e.statusCode < 500) {
      return reply.status(e.statusCode).send({ error: e.message ?? 'Bad request' });
    }
    app.log.error(err);
    return reply.status(500).send({ error: 'Internal server error' });
  });

  app.get('/health', async () => {
    await opts.db.query('SELECT 1');
    return { status: 'ok' };
  });

  const deps = { db: opts.db };
  await app.register(serviceRoutes, deps);
  await app.register(customerRoutes, deps);
  await app.register(providerRoutes, deps);
  await app.register(jobRoutes, deps);
  await app.register(chargeRoutes, deps);
  return app;
}
