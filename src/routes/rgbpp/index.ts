import { FastifyPluginCallback } from 'fastify';
import { Server } from 'http';
import container from '../../container';
import transactionRoutes from './transaction';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import assetsRoute from './assets';
import addressRoutes from './address';
import spvRoute from './spv';
import paymasterRoutes from './paymaster';

const rgbppRoutes: FastifyPluginCallback<Record<never, never>, Server, ZodTypeProvider> = (fastify, _, done) => {
  fastify.decorate('transactionManager', container.resolve('transactionManager'));
  fastify.decorate('paymaster', container.resolve('paymaster'));
  fastify.decorate('ckb', container.resolve('ckb'));
  fastify.decorate('bitcoin', container.resolve('bitcoin'));
  fastify.decorate('bitcoinSPV', container.resolve('bitcoinSPV'));

  fastify.register(transactionRoutes, { prefix: '/transaction' });
  fastify.register(assetsRoute, { prefix: '/assets' });
  fastify.register(addressRoutes, { prefix: '/address' });
  fastify.register(spvRoute, { prefix: '/btc-spv' });
  fastify.register(paymasterRoutes, { prefix: '/paymaster' });
  done();
};

export default rgbppRoutes;
