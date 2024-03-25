import pino from 'pino';
import container from '../../src/container';
import TransactionManager from '../../src/services/transaction';
import config from '../../vercel.json';

const VERCEL_MAX_DURATION = config.functions['api/cron/*.ts'].maxDuration;

export default async () => {
  const logger = container.resolve<pino.BaseLogger>('logger');
  const transactionManager: TransactionManager = container.resolve('transactionManager');
  await Promise.race([
    transactionManager.startProcess({
      onActive: (job) => {
        logger.info(`Job active: ${job.id}`);
      },
      onCompleted: (job) => {
        logger.info(`Job completed: ${job.id}`);
      },
    }),
    new Promise((resolve) => setTimeout(resolve, VERCEL_MAX_DURATION - 10_000)),
  ]);
  await transactionManager.pauseProcess();
  await transactionManager.closeProcess();
};
