import { FastifyPluginCallback } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { Server } from 'http';
import processTransactionsCronRoute from './process-transactions';
import unlockCellsCronRoute from './unlock-cells';
import syncUTXOCronRoute from './sync-utxo';
import collectRgbppCellsCronRoute from './collect-rgbpp-cells';

const cronRoutes: FastifyPluginCallback<Record<never, never>, Server, ZodTypeProvider> = (fastify, _, done) => {
  fastify.register(processTransactionsCronRoute);
  fastify.register(unlockCellsCronRoute);
  fastify.register(syncUTXOCronRoute);
  fastify.register(collectRgbppCellsCronRoute);
  done();
};

export default cronRoutes;
