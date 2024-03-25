import { ChainInfo } from '../routes/bitcoin/types';
import axios, { AxiosInstance } from 'axios';
import * as Sentry from '@sentry/node';
import { addLoggerInterceptor } from '../utils/interceptors';
import { Cradle } from '../container';
import { NetworkType } from '../constants';
import { randomUUID } from 'node:crypto';

/**
 * Bitcoind, a wrapper for Bitcoin Core JSON-RPC
 */
export default class Bitcoind {
  private request: AxiosInstance;

  constructor({ env, logger }: Cradle) {
    const {
      BITCOIN_JSON_RPC_USERNAME: username,
      BITCOIN_JSON_RPC_PASSWORD: password,
      BITCOIN_JSON_RPC_URL: baseURL,
    } = env;
    const credentials = `${username}:${password}`;
    const token = Buffer.from(credentials, 'utf-8').toString('base64');

    this.request = axios.create({
      baseURL,
      headers: {
        Authorization: `Basic ${token}`,
      },
    });
    addLoggerInterceptor(this.request, logger);
  }

  private async callMethod<T>(method: string, params: unknown): Promise<T> {
    return Sentry.startSpan({ op: this.constructor.name, name: method }, async () => {
      const id = randomUUID();
      const response = await this.request.post('', {
        jsonrpc: '1.0',
        id,
        method,
        params,
      });
      if (response.data.error) {
        throw new Error(response.data.error.message);
      }
      return response.data.result;
    });
  }

  public async checkNetwork(network: NetworkType) {
    const chainInfo = await this.getBlockchainInfo();
    switch (network) {
      case NetworkType.mainnet:
        if (chainInfo.chain !== 'main') {
          throw new Error('Bitcoin JSON-RPC is not running on mainnet');
        }
        break;
      case NetworkType.testnet:
        if (chainInfo.chain !== 'test') {
          throw new Error('Bitcoin JSON-RPC is not running on testnet');
        }
        break;
      default:
    }
  }

  // https://developer.bitcoin.org/reference/rpc/getblockchaininfo.html
  public async getBlockchainInfo() {
    return this.callMethod<ChainInfo>('getblockchaininfo', []);
  }

  // https://developer.bitcoin.org/reference/rpc/sendrawtransaction.html
  public async sendRawTransaction(txHex: string) {
    return this.callMethod<string>('sendrawtransaction', [txHex]);
  }
}
