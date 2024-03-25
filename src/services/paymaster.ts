import { Cell } from '@ckb-lumos/lumos';
import { Cradle } from '../container';
import { Job, Queue, Worker } from 'bullmq';
import { AppendPaymasterCellAndSignTxParams, IndexerCell, appendPaymasterCellAndSignCkbTx } from '@rgbpp-sdk/ckb';
import { hd, config, BI } from '@ckb-lumos/lumos';
import * as Sentry from '@sentry/node';

interface IPaymaster {
  getNextCellJob(token: string): Promise<Job<Cell> | null>;
  refillCellQueue(): Promise<number>;
  appendCellAndSignTx(
    txid: string,
    params: Pick<AppendPaymasterCellAndSignTxParams, 'ckbRawTx' | 'sumInputsCapacity'>,
  ): ReturnType<typeof appendPaymasterCellAndSignCkbTx>;
  makePaymasterCellAsSpent(txid: string, signedTx: CKBComponents.RawTransaction): Promise<void>;
}

export const PAYMASTER_CELL_QUEUE_NAME = 'rgbpp-ckb-paymaster-cell-queue';

class PaymasterCellNotEnoughError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PaymasterCellNotEnoughError';
  }
}

/**
 * Paymaster
 * responsible for managing the paymaster cells and signing the CKB transactions.
 */
export default class Paymaster implements IPaymaster {
  private cradle: Cradle;
  private queue: Queue<Cell>;
  private worker: Worker<Cell>;

  private cellCapacity: number;
  private presetCount: number;
  // the threshold to refill the queue, default is 0.3
  private refillThreshold: number;
  // avoid the refilling to be triggered multiple times
  private refilling = false;

  constructor(cradle: Cradle) {
    this.cradle = cradle;
    this.queue = new Queue(PAYMASTER_CELL_QUEUE_NAME, {
      connection: cradle.redis,
    });
    this.worker = new Worker(PAYMASTER_CELL_QUEUE_NAME, undefined, {
      connection: cradle.redis,
      removeOnComplete: { count: 0 },
    });
    this.cellCapacity = this.cradle.env.PAYMASTER_CELL_CAPACITY;
    this.presetCount = this.cradle.env.PAYMASTER_CELL_PRESET_COUNT;
    this.refillThreshold = this.cradle.env.PAYMASTER_CELL_REFILL_THRESHOLD;
  }

  private get privateKey() {
    return this.cradle.env.PAYMASTER_PRIVATE_KEY;
  }

  private get lockScript() {
    const args = hd.key.privateKeyToBlake160(this.privateKey);
    const scripts =
      this.cradle.env.NETWORK === 'mainnet' ? config.predefined.LINA.SCRIPTS : config.predefined.AGGRON4.SCRIPTS;
    const template = scripts['SECP256K1_BLAKE160']!;
    const lockScript = {
      codeHash: template.CODE_HASH,
      hashType: template.HASH_TYPE,
      args: args,
    };
    return lockScript;
  }

  /**
   * Get the next paymaster cell job from the queue
   * will refill the queue if the count is less than the threshold
   * @param token - the token to get the next job, using btc txid by default
   */
  public async getNextCellJob(token: string) {
    // avoid the refilling to be triggered multiple times
    if (!this.refilling) {
      const count = await this.queue.getWaitingCount();
      // refill if it's less than REFILL_THRESHOLD of the preset count
      if (count < this.presetCount * this.refillThreshold) {
        this.refilling = true;
        const filled = await this.refillCellQueue();
        if (filled + count < this.presetCount) {
          // XXX: consider to send an alert email or other notifications
          this.cradle.logger.warn('Filled paymaster cells less than the preset count');
          const error = new PaymasterCellNotEnoughError('Filled paymaster cells less than the preset count');
          Sentry.captureException(error);
        }
        this.refilling = false;
      }
    }
    const job = await this.worker.getNextJob(token);
    return job;
  }

  /**
   * Refill the paymaster cell queue
   * get cells from the indexer and add them to the queue
   * make sure the queue has enough cells to use for the next transactions
   */
  public async refillCellQueue() {
    const queueSize = await this.queue.getWaitingCount();
    const collector = this.cradle.ckbIndexer.collector({
      lock: this.lockScript,
      outputCapacityRange: [BI.from(this.cellCapacity).toHexString(), BI.from(this.cellCapacity + 1).toHexString()],
    });
    const cells = collector.collect();

    let filled = 0;
    if (queueSize >= this.presetCount) {
      return filled;
    }

    for await (const cell of cells) {
      const outPoint = cell.outPoint!;
      this.cradle.logger.info(
        `[Paymaster] Refill paymaster cell: ${outPoint.txHash}:${outPoint.index}, ${cell.cellOutput.capacity} CKB`,
      );
      await this.queue.add(PAYMASTER_CELL_QUEUE_NAME, cell, {
        // use the outPoint as the jobId to avoid duplicate cells
        jobId: `${outPoint.txHash}:${outPoint.index}`,
      });
      // count the filled cells, it maybe less than the cells we added
      // because we may have duplicate cells, but it's work fine
      filled += 1;
      if (queueSize + filled >= this.presetCount) {
        break;
      }
    }
    return filled;
  }

  /**
   * Append the paymaster cell to the CKB transaction and sign the transactions
   * @param token - the token to get the next job, using btc txid by default
   * @param params - the ckb transaction parameters
   */
  public async appendCellAndSignTx(
    token: string,
    params: Pick<AppendPaymasterCellAndSignTxParams, 'ckbRawTx' | 'sumInputsCapacity'>,
  ) {
    const { ckbRawTx, sumInputsCapacity } = params;
    const { data: cell } = await this.getNextCellJob(token);
    const paymasterCell: IndexerCell = {
      output: cell.cellOutput,
      outPoint: cell.outPoint!,
      outputData: cell.data,
      blockNumber: cell.blockNumber!,
      txIndex: cell.txIndex!,
    };
    this.cradle.logger.debug(`[Paymaster] Get paymaster cell: ${JSON.stringify(paymasterCell)}`);

    const signedTx = await appendPaymasterCellAndSignCkbTx({
      ckbRawTx,
      sumInputsCapacity,
      paymasterCell,
      secp256k1PrivateKey: this.privateKey,
      isMainnet: this.cradle.env.NETWORK === 'mainnet',
    });
    return signedTx;
  }

  /**
   * Mark the paymaster cell as spent after the transaction is confirmed to avoid double spending
   * @param token - the job token moved from the queue to the completed
   * @param signedTx - the signed transaction to get the paymaster cell input to mark as spent
   */
  public async makePaymasterCellAsSpent(token: string, signedTx: CKBComponents.RawTransaction) {
    for await (const input of signedTx.inputs) {
      const outPoint = input.previousOutput;
      if (!outPoint) {
        continue;
      }
      const id = `${outPoint.txHash}:${outPoint.index}`;
      const job = await this.queue.getJob(id);
      if (job) {
        await job.moveToCompleted(null, token);
      }
    }
  }
}
