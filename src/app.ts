import fastify, { type FastifySchemaCompiler } from 'fastify';
import { FastifyInstance } from 'fastify';
import sensible, { httpErrors } from '@fastify/sensible';
import compress from '@fastify/compress';
import bitcoinRoutes from './routes/bitcoin';
import tokenRoutes from './routes/token';
import swagger from './plugins/swagger';
import jwt from './plugins/jwt';
import cache from './plugins/cache';
import rateLimit from './plugins/rate-limit';
import { getSafeEnvs } from './env';
import container from './container';
import { asValue } from 'awilix';
import options from './options';
import { serializerCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import cors from './plugins/cors';
import { NetworkType } from './constants';
import rgbppRoutes from './routes/rgbpp';
import cronRoutes from './routes/cron';
import { provider } from 'std-env';
import ipBlock from './plugins/ip-block';
import internalRoutes from './routes/internal';
import healthcheck from './plugins/healthcheck';
import sentry from './plugins/sentry';
import cron from './plugins/cron';
import { ZodAny } from 'zod';

async function routes(fastify: FastifyInstance) {
  fastify.log.info(`Process env: ${JSON.stringify(getSafeEnvs(), null, 2)}`);
  const env = container.resolve('env');

  await fastify.register(sentry);
  fastify.register(sensible);
  fastify.register(compress);

  await container.resolve('bitcoin').checkNetwork(env.NETWORK as NetworkType);

  fastify.log.info(`Application mode: ${env.APP_MODE}`);
  if (['full', 'api'].includes(env.APP_MODE)) {
    await fastify.register(cors);
    fastify.register(swagger);
    fastify.register(jwt);
    fastify.register(ipBlock);
    fastify.register(cache);
    fastify.register(rateLimit);
    fastify.register(healthcheck);

    fastify.register(internalRoutes, { prefix: '/internal' });
    fastify.register(tokenRoutes, { prefix: '/token' });
    fastify.register(bitcoinRoutes, { prefix: '/bitcoin/v1' });
    fastify.register(rgbppRoutes, { prefix: '/rgbpp/v1' });

    fastify.log.info('Routes are registered');
  }

  if (['full', 'background'].includes(env.APP_MODE)) {
    // register cron routes only on Vercel
    if (provider === 'vercel' || env.NODE_ENV === 'test') {
      fastify.register(cronRoutes, { prefix: '/cron' });
      fastify.log.info('Cron routes is registered');
    } else {
      await fastify.register(cron);
      fastify.addHook('onReady', () => {
        fastify.cron.startAllJobs();
      });
      fastify.log.info('Cron plugin is registered');
    }
  }
}

export const validatorCompiler: FastifySchemaCompiler<ZodAny> =
  ({ schema }) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (data) => {
    const result = schema.safeParse(data);
    if (result.success) {
      return { value: result.data };
    }

    const error = result.error;
    if (error.errors.length) {
      const firstError = error.errors[0];
      const propName = firstError.path.length ? firstError.path.join('.') : 'param';
      return {
        error: httpErrors.badRequest(`Invalid ${propName}: ${error.errors[0].message}`),
      };
    }
    return { error };
  };

export function buildFastify() {
  const app = fastify(options).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  container.register({ logger: asValue(app.log) });
  app.decorate('container', container);

  app.register(routes);
  return app;
}
