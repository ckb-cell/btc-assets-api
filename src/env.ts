import 'dotenv/config';
import z from 'zod';
import process from 'node:process';
import { omit } from 'lodash';

const envSchema = z
  .object({
    NODE_ENV: z.string().default('development'),
    PORT: z.string().optional(),
    ADDRESS: z.string().optional(),
    NETWORK: z.enum(['mainnet', 'testnet', 'signet']).default('testnet'),
    LOGGER_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

    /**
     * Set /token/generate default domain param
     */
    DOMAIN: z.string().optional(),

    /**
     * Fastify `trustProxy` option
     * - only supports true/false: Trust all proxies (true) or do not trust any proxies (false).
     *
     * https://fastify.dev/docs/latest/Reference/Server/#trustproxy
     */
    TRUST_PROXY: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),

    /**
     * Redis URL, used for caching and rate limiting.
     */
    REDIS_URL: z.string(),

    /**
     * Sentry Configuration
     */
    SENTRY_DSN_URL: z.string().optional(),
    SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().default(0.5),
    SENTRY_PROFILES_SAMPLE_RATE: z.coerce.number().default(0.5),
    SENTRY_IGNORE_UTXO_SYNC_ERROR_ADDRESSES: z
      .string()
      .default('')
      .transform((value) => {
        const addresses = value.split(',');
        return addresses.map((address) => address.trim());
      }),

    /**
     * The rate limit per minute for each IP address.
     */
    RATE_LIMIT_PER_MINUTE: z.coerce.number().default(100),
    /**
     * The blocklist of IP addresses that are denied access to the API.
     */
    IP_BLOCKLIST: z
      .string()
      .default('')
      .transform((value) => value.split(','))
      .pipe(z.string().array()),

    ADMIN_USERNAME: z.string().optional(),
    ADMIN_PASSWORD: z.string().optional(),

    /**
     * JWT_SECRET is used to sign the JWT token for authentication.
     */
    JWT_SECRET: z.string(),
    /**
     * JWT_DENYLIST is used to store the denylisted JWT tokens.
     * support multiple tokens separated by comma, use token or jti to denylist.
     */
    JWT_DENYLIST: z
      .string()
      .default('')
      .transform((value) => value.split(','))
      .pipe(z.string().array()),

    /**
     * Application Mode
     * - full: Full application mode, includes API and background tasks.
     * - api_only: API only mode, excludes background tasks.
     * - background_only: Background tasks only mode, excludes API.
     */
    APP_MODE: z.enum(['full', 'api', 'background']).default('full'),

    /**
     * Bitcoin SPV service URL
     * https://github.com/ckb-cell/ckb-bitcoin-spv-service
     */
    BITCOIN_SPV_SERVICE_URL: z.string(),

    /**
     * Bitcoin additional broadcast electrs URL list
     * broadcast transaction to multiple electrs API when receive bitcoin transaction from users
     */
    BITCOIN_ADDITIONAL_BROADCAST_ELECTRS_URL_LIST: z
      .string()
      .transform((value) => value.split(','))
      .optional(),

    /**
     * The URL of the CKB JSON-RPC server.
     */
    CKB_RPC_URL: z.string(),

    /**
     * The async concurrency size limit for CKB RPC requests.
     */
    CKB_RPC_MAX_CONCURRENCY: z.coerce.number().default(100),
    /**
     * Paymaster private key, used to sign the transaction with paymaster cell.
     */
    PAYMASTER_PRIVATE_KEY: z.string(),
    /**
     * Paymaster cell capacity in shannons
     * (254 CKB for RGB++ capacity + 61 CKB for change cell capacity + 1 CKB for fee cell)
     */
    PAYMASTER_CELL_CAPACITY: z.coerce.number().default(316 * 10 ** 8),
    /**
     * Paymaster cell queue preset count, used to refill paymaster cell.
     */
    PAYMASTER_CELL_PRESET_COUNT: z.coerce.number().default(500),
    /**
     * Paymaster cell refill threshold, refill paymaster cell when the balance is less than this threshold.
     */
    PAYMASTER_CELL_REFILL_THRESHOLD: z.coerce.number().default(0.3),

    /**
     * Paymaster receive UTXO check flag, used to check the paymaster BTC UTXO when processing rgb++ ckb transaction.
     */
    PAYMASTER_RECEIVE_UTXO_CHECK: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    /**
     * Paymaster bitcoin address, used to receive BTC from users.
     * enable paymaster BTC UTXO check if set.
     */
    PAYMASTER_RECEIVE_BTC_ADDRESS: z.string().optional(),
    /**
     * Paymaster receives BTC UTXO size in sats
     */
    PAYMASTER_BTC_CONTAINER_FEE_SATS: z.coerce.number().default(7000),

    /**
     * Enable BTCTimeLock cell unlock cron task
     * set to false to disable the BTCTimeLock cell unlock cron task
     */
    UNLOCKER_CRON_TASK_ENABLE: z
      .enum(['true', 'false'])
      .default('true')
      .transform((value) => value === 'true'),
    /**
     * BTCTimeLock cell unlock batch size
     */
    UNLOCKER_CRON_SCHEDULE: z.string().default('*/5 * * * *'),
    /**
     * BTCTimeLock cell unlock cron job schedule, default is every 5 minutes
     */
    UNLOCKER_CELL_BATCH_SIZE: z.coerce.number().default(100),
    /**
     * BTCTimeLock cell unlocker monitor slug, used for monitoring unlocker status on sentry
     */
    UNLOCKER_MONITOR_SLUG: z.string().default('btctimelock-cells-unlock'),

    /**
     * RGB++ CKB transaction Queue cron job delay in milliseconds
     * the /rgbpp/v1/transaction/ckb-tx endpoint is called, the transaction will be added to the queue
     */
    TRANSACTION_QUEUE_JOB_DELAY: z.coerce.number().default(120 * 1000),
    /**
     * RGB++ CKB transaction Queue cron job attempts
     * used to retry the transaction queue job when failed
     */
    TRANSACTION_QUEUE_JOB_ATTEMPTS: z.coerce.number().default(6),
    /**
     * Pay fee for transaction with pool reject by min fee rate, false by default
     * (If set to true, the transaction will be paid for the minimum fee rate and resent
     * when the transaction throw PoolRejectedTransactionByMinFeeRate error)
     *
     */
    TRANSACTION_PAY_FOR_MIN_FEE_RATE_REJECT: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),

    /**
     * UTXO sync data cache enable flag, used to cache the UTXO sync data
     * enable by default
     */
    UTXO_SYNC_DATA_CACHE_ENABLE: z
      .enum(['true', 'false'])
      .default('true')
      .transform((value) => value === 'true'),
    /**
     * UTXO sync repeat base duration, used to set the UTXO sync repeat interval
     * repeat job start interval is 10 seconds by default
     */
    UTXO_SYNC_REPEAT_BASE_DURATION: z.coerce.number().default(10 * 1000),
    /**
     * UTXO sync repeat max duration, used to maximum the UTXO sync repeat interval
     * 1 hour by default
     */
    UTXO_SYNC_REPEAT_MAX_DURATION: z.coerce.number().default(60 * 60 * 1000),
    /**
     * UTXO sync repeat expired duration, used to remove the expired UTXO sync job
     * 336 hours by default
     */
    UTXO_SYNC_REPEAT_EXPRIED_DURATION: z.coerce.number().default(336 * 60 * 60 * 1000),
    /**
     * UTXO sync data cache expire duration, used to cache the UTXO sync data
     * 30 minutes by default
     */
    UTXO_SYNC_DATA_CACHE_EXPIRE: z.coerce.number().default(30 * 60 * 1000),

    /**
     * RGB++ collect data cache enable flag, used to cache the RGB++ collect data
     * enable by default
     */
    RGBPP_COLLECT_DATA_CACHE_ENABLE: z
      .enum(['true', 'false'])
      .default('true')
      .transform((value) => value === 'true'),
    /**
     * RGB++ collect data cache expire duration, used to cache the RGB++ collect data
     */
    RGBPP_COLLECT_DATA_CACHE_EXPIRE: z.coerce.number().default(30 * 60 * 1000),
  })
  .and(
    z.union([
      z.object({
        /**
         * Bitcoin Mempool.space API URL
         * used to get bitcoin data and broadcast transaction.
         */
        BITCOIN_MEMPOOL_SPACE_API_URL: z.string(),
        /**
         * The URL of the Electrs API.
         * Electrs is a Rust implementation of Electrum Server.
         * used for fallback when the mempool.space API is not available.
         */
        BITCOIN_ELECTRS_API_URL: z.string().optional(),
        /**
         * Bitcoin data provider, support mempool and electrs
         * use mempool.space as default, electrs as fallback
         * change to electrs if you want to use electrs as default and mempool.space as fallback
         */
        BITCOIN_DATA_PROVIDER: z.literal('mempool'),
      }),
      z.object({
        /**
         * The URL of the Electrs API.
         * Electrs is a Rust implementation of Electrum Server.
         */
        BITCOIN_ELECTRS_API_URL: z.string(),
        /**
         * Bitcoin Mempool.space API URL
         * used to get bitcoin data and broadcast transaction.
         * used for fallback when the electrs API is not available.
         */
        BITCOIN_MEMPOOL_SPACE_API_URL: z.string().optional(),
        BITCOIN_DATA_PROVIDER: z.literal('electrs').default('electrs'),
      }),
    ]),
  );

export type Env = z.infer<typeof envSchema>;
export const env = envSchema.parse(process.env);

export const getSafeEnvs = () =>
  omit(env, ['ADMIN_PASSWORD', 'JWT_SECRET', 'BITCOIN_JSON_RPC_PASSWORD', 'PAYMASTER_PRIVATE_KEY']);

export const isAdminMode = env.NODE_ENV === 'production' && env.ADMIN_USERNAME && env.ADMIN_PASSWORD;
