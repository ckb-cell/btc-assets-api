import fp from 'fastify-plugin';
import TransactionProcessor from '../services/transaction';
import cron, { Params as CronJobParams } from 'fastify-cron';
import { Env } from '../env';
import Unlocker from '../services/unlocker';

export default fp(async (fastify) => {
  try {
    const cronJobs: CronJobParams[] = [];
    const env: Env = fastify.container.resolve('env');

    const getSentryCheckIn = (monitorSlug: string, crontab: string) => {
      const checkInId = fastify.Sentry.captureCheckIn(
        {
          monitorSlug,
          status: 'in_progress',
        },
        {
          schedule: {
            type: 'crontab',
            value: crontab,
          },
          // create a new issue when 3 times missed or error check-ins are processed
          failure_issue_threshold: 3,
          // close the issue when 3 times ok check-ins are processed
          recovery_threshold: 3,
        },
      );
      return {
        ok: () => {
          fastify.Sentry.captureCheckIn({
            checkInId,
            monitorSlug,
            status: 'ok',
          });
        },
        error: () => {
          fastify.Sentry.captureCheckIn({
            checkInId,
            monitorSlug,
            status: 'error',
          });
        },
      };
    };

    // processing rgb++ ckb transaction
    const transactionProcessor: TransactionProcessor = fastify.container.resolve('transactionProcessor');
    fastify.addHook('onReady', async () => {
      transactionProcessor.startProcess({
        onActive: (job) => {
          fastify.log.info(`Job active: ${job.id}`);
        },
        onCompleted: (job) => {
          fastify.log.info(`Job completed: ${job.id}`);
        },
      });
    });
    fastify.addHook('onClose', async () => {
      transactionProcessor.closeProcess();
    });

    const retryMissingTransactionsJob = {
      name: `retry-missing-transacitons-${env.NETWORK}`,
      cronTime: '*/5 * * * *',
      onTick: async () => {
        fastify.Sentry.startSpan({ op: 'cron', name: 'retry-missing-transactions' }, async () => {
          const { name, cronTime } = retryMissingTransactionsJob;
          const checkIn = getSentryCheckIn(name, cronTime);
          try {
            await transactionProcessor.retryMissingTransactions();
            checkIn.ok();
          } catch (err) {
            checkIn.error();
            fastify.log.error(err);
            fastify.Sentry.captureException(err);
          }
        });
      },
    };
    cronJobs.push(retryMissingTransactionsJob);

    // processing unlock BTC_TIME_LOCK cells
    if (env.UNLOCKER_CRON_TASK_ENABLE) {
      const unlocker: Unlocker = fastify.container.resolve('unlocker');
      const monitorSlug = env.UNLOCKER_MONITOR_SLUG;
      const unlockBTCTimeLockCellsJob = {
        name: monitorSlug,
        cronTime: env.UNLOCKER_CRON_SCHEDULE,
        onTick: async () => {
          fastify.Sentry.startSpan({ op: 'cron', name: monitorSlug }, async () => {
            const { name, cronTime } = unlockBTCTimeLockCellsJob;
            const checkIn = getSentryCheckIn(name, cronTime);
            try {
              await unlocker.unlockCells();
              checkIn.ok();
            } catch (err) {
              checkIn.error();
              fastify.log.error(err);
              fastify.Sentry.captureException(err);
            }
          });
        },
      };
      cronJobs.push(unlockBTCTimeLockCellsJob);
    }

    fastify.register(cron, {
      jobs: cronJobs,
    });
  } catch (err) {
    fastify.log.error(err);
    fastify.Sentry.captureException(err);
  }
});
