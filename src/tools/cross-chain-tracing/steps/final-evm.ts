import { z } from 'zod';
import { ResponseFormatter } from '../../../utils/response-formatter';
import { get as httpGet } from '../../../utils/api-client';
import { evmChainEnum, evmAddress } from '../schemas';
import {
  getEtherscanApiKey,
  canonicalizeChain,
  getChainInfo,
} from '../helpers';
import type { TraceItem } from '../types';

export const finalEvmTxHandlerSchema = {
  destChain: evmChainEnum.describe(
    'Destination chain name (avalanche, arbitrum, ethereum, optimism, base)',
  ),
  destinationEvmAddress: evmAddress.describe('Destination EVM address (0x...)'),
  expectedAmount: z
    .string()
    .optional()
    .describe('Expected transaction amount to match'),
};

/**
 * Traces the final EVM transaction where USDC is received on the destination chain.
 * This is Step 4 (final step) of the cross-chain flow, where the CCTP mint completes
 * and tokens arrive at the destination EVM address.
 *
 * High-level flow:
 * 1. Query Etherscan API for recent transactions to destination address
 * 2. Filter for execute* function calls (CCTP mint transactions)
 * 3. Get the most recent execute transaction
 * 4. Fetch transaction receipt to extract token transfer logs
 * 5. Parse Transfer event logs to find USDC amount received
 * 6. Optionally verify amount matches expected burn amount from Step 3
 * 7. Return transaction details with explorer link and token transfer amount
 */
export const finalEvmTxHandler = async (params: {
  destChain?: string;
  destinationEvmAddress?: string;
  expectedAmount?: string;
}) => {
  const {
    destChain: destChainParam,
    destinationEvmAddress,
    expectedAmount,
  } = params;

  if (!destChainParam || !destinationEvmAddress) {
    return ResponseFormatter.error('Missing required parameters');
  }

  let destChain = destChainParam;

  try {
    destChain = canonicalizeChain(destChain);

    const chainInfo = getChainInfo(destChain);
    if (!chainInfo) {
      return ResponseFormatter.error(
        `Unsupported destination chain: ${destChain}`,
      );
    }

    const chainId = chainInfo.CHAIN_ID;
    const apiKey = getEtherscanApiKey();

    if (!apiKey) {
      return ResponseFormatter.error('Missing Etherscan API key');
    }

    // Build Etherscan API request
    const baseUrl = 'https://api.etherscan.io/v2/api';
    const url = new URL(baseUrl);
    url.searchParams.set('chainid', String(chainId));
    url.searchParams.set('module', 'account');
    url.searchParams.set('action', 'txlist');
    url.searchParams.set('address', destinationEvmAddress);
    url.searchParams.set('sort', 'desc');
    url.searchParams.set('page', '1');
    url.searchParams.set('offset', '20');
    url.searchParams.set('apikey', apiKey);

    const response = await httpGet<any>(url.toString());
    if (!response) {
      return ResponseFormatter.error('Etherscan API request failed');
    }

    const { status, message, result } = response;

    // Etherscan returns status "0" for errors, but result can still be an array
    if (status === '0' && !Array.isArray(result)) {
      const errorMsg = typeof result === 'string' ? result : message || 'NOTOK';
      return ResponseFormatter.error(`Etherscan error: ${errorMsg}`);
    }

    const transactions = Array.isArray(result) ? result : [];

    // Find most recent `execute*` transaction
    const executes = transactions.filter((t: any) =>
      String(t.functionName || '').startsWith('execute'),
    );
    executes.sort(
      (a: any, b: any) => Number(b.timeStamp || 0) - Number(a.timeStamp || 0),
    );
    const evmTx = executes[0];

    if (!evmTx) {
      return ResponseFormatter.success({
        step: 'step4',
        title: 'Final EVM Transaction',
        found: false,
        items: [],
        message: 'No execute* transactions found',
      });
    }

    const explorer = chainInfo.EXPLORER_URL;
    const items: TraceItem[] = [];

    // Add readable transaction info
    if (evmTx.hash) {
      items.push({
        label: 'Tx Hash',
        value: evmTx.hash,
        href: explorer ? `${explorer}${evmTx.hash}` : undefined,
      });
    }

    if (evmTx.from) items.push({ label: 'From', value: evmTx.from });
    if (evmTx.to) items.push({ label: 'To', value: evmTx.to });
    if (evmTx.blockNumber)
      items.push({ label: 'Block', value: String(evmTx.blockNumber) });
    if (evmTx.timeStamp) {
      const date = new Date(Number(evmTx.timeStamp) * 1000);
      items.push({ label: 'Time', value: date.toISOString() });
    }
    if (evmTx.functionName) {
      const methodName = String(evmTx.functionName).split('(')[0];
      items.push({ label: 'Method', value: methodName });
    }

    if (evmTx.gasUsed) {
      items.push({
        label: 'Gas Used',
        value: String(evmTx.gasUsed),
      });
    }

    if (evmTx.gasPrice) {
      const gasPriceGwei = Number(evmTx.gasPrice) / 1e9;
      items.push({
        label: 'Gas Price (Gwei)',
        value: gasPriceGwei.toFixed(2),
      });
    }

    // Fetch receipt for transfer details
    let tokenTransferAmount: string | null = null;

    try {
      const receiptUrl = new URL(baseUrl);
      receiptUrl.searchParams.set('chainid', String(chainId));
      receiptUrl.searchParams.set('module', 'proxy');
      receiptUrl.searchParams.set('action', 'eth_getTransactionReceipt');
      receiptUrl.searchParams.set('txhash', evmTx.hash);
      receiptUrl.searchParams.set('apikey', apiKey);

      const receiptResponse = await httpGet<any>(receiptUrl.toString());
      const receipt = receiptResponse?.result;

      if (receipt?.logs) {
        const transferTopic =
          '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

        for (const log of receipt.logs) {
          if (log.topics?.[0] === transferTopic && log.topics.length >= 3) {
            const toAddress = '0x' + log.topics[2].slice(26);
            if (
              toAddress.toLowerCase() === destinationEvmAddress.toLowerCase()
            ) {
              tokenTransferAmount = log.data;

              let amountBaseUnits: bigint;
              try {
                amountBaseUnits = BigInt(log.data);
              } catch {
                continue;
              }

              items.push({
                label: 'Token Transfer (base units)',
                value: amountBaseUnits.toString(),
              });

              if (expectedAmount) {
                try {
                  const expectedBaseUnits = BigInt(expectedAmount);
                  if (amountBaseUnits === expectedBaseUnits) {
                    items.push({
                      label: 'Amount Match',
                      value: 'Matches expected base-unit amount',
                    });
                  }
                } catch (e) {
                  console.error('Error comparing expectedAmount:', e);
                }
              }
              break;
            }
          }
        }
      }
    } catch (e) {
      console.warn('Error parsing transaction receipt:', e);
    }

    const sanitizedTx = {
      hash: String(evmTx.hash),
      from: String(evmTx.from),
      to: String(evmTx.to),
      value: String(evmTx.value ?? '0'),
      blockNumber: Number(evmTx.blockNumber ?? 0),
      timeStamp: new Date(Number(evmTx.timeStamp) * 1000).toISOString(),
      gasUsed: String(evmTx.gasUsed ?? '0'),
      gasPrice: String(evmTx.gasPrice ?? '0'),
      method: evmTx.functionName
        ? String(evmTx.functionName).split('(')[0]
        : undefined,
      confirmations: Number(evmTx.confirmations ?? 0),
      explorerUrl: explorer ? `${explorer}${evmTx.hash}` : undefined,
    };

    return ResponseFormatter.success({
      title: 'Final EVM Transaction',
      found: true,
      txHash: sanitizedTx.hash,
      tokenTransferAmount,
      transaction: sanitizedTx,
      items,
    });
  } catch (error) {
    return ResponseFormatter.error(
      `Error tracing final EVM transaction: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`,
    );
  }
};
