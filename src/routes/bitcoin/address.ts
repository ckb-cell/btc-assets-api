import { Type, TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { FastifyPluginCallback } from 'fastify';
import { Server } from 'http';
import { Balance, BalanceType, Transaction, UTXO, UTXOType } from './types';
import validateBitcoinAddress from '../../utils/validators';

const addressRoutes: FastifyPluginCallback<Record<never, never>, Server, TypeBoxTypeProvider> = (
  fastify,
  _,
  done,
) => {
  fastify.addHook('preHandler', (request, _, done) => {
    const { address } = request.params as { address: string };
    const valid = validateBitcoinAddress(address);
    if (!valid) {
      throw fastify.httpErrors.badRequest('invalid bitcoin address');
    }
    done();
  });

  fastify.get(
    '/:address/balance',
    {
      schema: {
        params: Type.Object({
          address: Type.String(),
        }),
        response: {
          200: Balance,
        },
      },
    },
    async (request) => {
      const { address } = request.params;
      const utxos = await fastify.electrs.getUtxoByAddress(address);
      return utxos.reduce(
        (acc: BalanceType, utxo: UTXOType) => {
          if (utxo.status.confirmed) {
            acc.satoshi += utxo.value;
          } else {
            acc.pending_satoshi += utxo.value;
          }
          return acc;
        },
        {
          address,
          satoshi: 0,
          pending_satoshi: 0,
          utxo_count: utxos.length,
        },
      );
    },
  );

  fastify.get(
    '/:address/unspent',
    {
      schema: {
        params: Type.Object({
          address: Type.String(),
        }),
        response: {
          200: Type.Array(UTXO),
        },
      },
    },
    async function (request) {
      const { address } = request.params;
      const utxos = await fastify.electrs.getUtxoByAddress(address);
      return utxos;
    },
  );

  fastify.get(
    '/:address/txs',
    {
      schema: {
        params: Type.Object({
          address: Type.String(),
        }),
        response: {
          200: Type.Array(Transaction),
        },
      },
    },
    async (request) => {
      const { address } = request.params;
      const txs = await fastify.electrs.getTransactionsByAddress(address);
      return txs;
    },
  );

  done();
};

export default addressRoutes;
