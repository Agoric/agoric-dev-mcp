import { z } from 'zod';
import { ResponseFormatter } from '../../../utils/response-formatter';
import { get as httpGet } from '../../../utils/api-client';
import { evmChainEnum, bech32Noble, evmAddress } from '../schemas';
import {
  getMintscanHeaders,
  normalizeAddress,
  canonicalizeChain,
  getChainInfo,
} from '../helpers';
import type { TraceItem } from '../types';

export const cctpNobleTxHandlerSchema = {
  nobleAddress: bech32Noble.describe('Noble address (noble1...)'),
  destChain: evmChainEnum.describe(
    'Destination chain name (avalanche, arbitrum, ethereum, optimism, base)',
  ),
  destinationEvmAddress: evmAddress.describe('Destination EVM address (0x...)'),
  take: z
    .number()
    .optional()
    .default(20)
    .describe('Number of transactions to fetch'),
};

// Decode base64 `mint_recipient` into an EVM-style address
function decodeMintRecipient(base64Str: string): string | null {
  try {
    const binary = atob(base64Str);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    if (bytes.length < 20) {
      console.error('[Step3] mint_recipient too short:', bytes.length);
      return null;
    }

    const evmBytes = bytes.slice(-20);
    return (
      '0x' +
      Array.from(evmBytes, (b) => b.toString(16).padStart(2, '0')).join('')
    );
  } catch (e) {
    console.error('[Step3] Failed to decode mint_recipient:', e);
    return null;
  }
}

// Extract mint_recipient and destination_domain from logs
export function extractCctpDataFromLogs(logs: any[]): {
  mintRecipient: string | null;
  destinationDomain: string | null;
} {
  const evt =
    (logs ?? [])
      .flatMap((l: any) => l?.events ?? [])
      .find((e: any) => e?.type === 'circle.cctp.v1.DepositForBurn') ?? null;

  if (!evt) return { mintRecipient: null, destinationDomain: null };

  const attrs = (evt.attributes ?? []).reduce(
    (m: Record<string, string>, a: any) => {
      if (a?.key && a?.value !== undefined && a?.value !== null) {
        m[a.key] = String(a.value).replace(/^"+|"+$/g, '');
      }
      return m;
    },
    {},
  );

  const base64Recipient = attrs['mint_recipient'] ?? null;
  const destinationDomain = attrs['destination_domain'] ?? null;

  return {
    mintRecipient: base64Recipient
      ? decodeMintRecipient(base64Recipient)
      : null,
    destinationDomain,
  };
}

/**
 * Traces the CCTP (Cross-Chain Transfer Protocol) burn transaction on Noble.
 * This is Step 3 of the cross-chain flow, where USDC is burned on Noble to be
 * minted on the destination EVM chain via Circle's CCTP.
 *
 * High-level flow:
 * 1. Query Mintscan API for MsgBurn transactions from Noble address
 * 2. Parse transaction logs to extract CCTP data (mint_recipient, destination_domain)
 * 3. Decode base64 mint_recipient to get destination EVM address
 * 4. Match transactions where destination domain and address match expected values
 * 5. Extract burn amount from message body
 * 6. Return Noble transaction link and burn amount for use in Step 4
 */
export const cctpNobleTxHandler = async (params: {
  nobleAddress?: string;
  destChain?: string;
  destinationEvmAddress?: string;
  take?: number;
}) => {
  const {
    nobleAddress,
    destChain: destChainParam,
    destinationEvmAddress,
    take = 20,
  } = params;

  if (!nobleAddress || !destChainParam || !destinationEvmAddress) {
    return ResponseFormatter.error('Missing required parameters');
  }

  try {
    const destChain = canonicalizeChain(destChainParam);

    // Build Mintscan API URL to query MsgBurn transactions
    const messageTypeKey = encodeURIComponent('messageTypes[0]');
    const messageTypeVal = 'circle.fiattokenfactory.v1.MsgBurn';
    const url = `https://apis.mintscan.io/v1/noble/accounts/${nobleAddress}/transactions?take=${take}&${messageTypeKey}=${messageTypeVal}`;

    const response = await httpGet(
      url,
      'application/json',
      true,
      3,
      getMintscanHeaders(),
    );

    const transactions =
      (response as any)?.data?.transactions ||
      (response as any)?.transactions ||
      [];

    const chainInfo = getChainInfo(destChain);
    if (!chainInfo) {
      return ResponseFormatter.error(
        `Unsupported destination chain: ${destChain}`,
      );
    }

    const expectedDomain = chainInfo.DOMAIN;
    const items: TraceItem[] = [];

    for (const tx of transactions) {
      const { mintRecipient, destinationDomain } = extractCctpDataFromLogs(
        tx?.logs || [],
      );

      const sameDomain = String(destinationDomain) === String(expectedDomain);
      const sameAddress =
        normalizeAddress(mintRecipient || '') ===
        normalizeAddress(destinationEvmAddress);

      if (sameDomain && sameAddress) {
        const txHash = tx.txhash;
        const txUrl = `https://www.mintscan.io/noble/txs/${txHash}`;

        items.push({
          label: 'Noble CCTP Tx',
          value: txHash,
          href: txUrl,
        });

        const messages = tx?.tx?.body?.messages || [];
        let burnAmount: string | null = null;
        let burnDenom: string | null = null;

        for (const msg of messages) {
          if (
            msg?.['@type'] === '/circle.fiattokenfactory.v1.MsgBurn' &&
            msg?.amount
          ) {
            burnAmount = msg.amount.amount;
            burnDenom = msg.amount.denom;
            break;
          }
        }

        items.push({ label: 'Destination EVM', value: destinationEvmAddress });
        items.push({
          label: 'Destination Domain',
          value: String(destinationDomain),
        });

        if (burnAmount && burnDenom) {
          items.push({
            label: 'Amount',
            value: `${burnAmount} ${burnDenom}`,
          });
        }

        const sanitizedTx = {
          hash: String(tx.txhash),
          height: Number(tx.height ?? 0),
          code: Number(tx.code ?? 0),
          timestamp: new Date(tx.timestamp).toISOString(),
          explorerUrl: txUrl,
        };

        return ResponseFormatter.success({
          title: 'CCTP on Noble',
          found: true,
          txHash: sanitizedTx.hash,
          burnAmount,
          burnDenom,
          transaction: sanitizedTx,
          items,
        });
      }
    }

    return ResponseFormatter.success({
      title: 'CCTP on Noble',
      found: false,
      items: [],
      message: 'No matching CCTP burn transactions found',
    });
  } catch (error) {
    return ResponseFormatter.error(
      `Error tracing CCTP Noble step: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`,
    );
  }
};
