import fastify from 'fastify';
import { FastifyInstance } from 'fastify';
import { AxiosError } from 'axios';
import sensible from '@fastify/sensible';
import compress from '@fastify/compress';
import * as Sentry from '@sentry/node';
import { ProfilingIntegration } from '@sentry/profiling-node';
import bitcoinRoutes from './routes/bitcoin';
import tokenRoutes from './routes/token';
import swagger from './plugins/swagger';
import jwt from './plugins/jwt';
import cache from './plugins/cache';
import rateLimit from './plugins/rate-limit';
import { env } from './env';
import container from './container';
import { asValue } from 'awilix';
import options from './options';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import cors from './plugins/cors';

if (env.SENTRY_DSN_URL && env.NODE_ENV !== 'development') {
  Sentry.init({
    dsn: env.SENTRY_DSN_URL,
    tracesSampleRate: 1.0,
    profilesSampleRate: 1.0,
    integrations: [new ProfilingIntegration()],
  });
}

async function routes(fastify: FastifyInstance) {
  container.register({ logger: asValue(fastify.log) });
  fastify.decorate('container', container);

  await fastify.register(cors);
  fastify.register(sensible);
  fastify.register(compress);
  fastify.register(swagger);
  fastify.register(jwt);
  fastify.register(cache);
  fastify.register(rateLimit);

  fastify.register(tokenRoutes, { prefix: '/token' });
  fastify.register(bitcoinRoutes, { prefix: '/bitcoin/v1' });

  fastify.setErrorHandler((error, _, reply) => {
    fastify.log.error(error);
    Sentry.captureException(error);
    if (error instanceof AxiosError) {
      const { response } = error;
      reply.status(response?.status ?? 500).send({ ok: false, error: response?.data ?? error.message });
      return;
    }
    reply.status(error.statusCode ?? 500).send({ ok: false, statusCode: error.statusCode, message: error.message });
  });
}

export function buildFastify() {
  const app = fastify(options).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.register(routes);
  return app;
}
