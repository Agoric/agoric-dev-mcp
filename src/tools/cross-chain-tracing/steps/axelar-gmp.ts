import { z } from 'zod';
import { ResponseFormatter } from '../../../utils/response-formatter';
import { evmChainEnum, bech32Agoric } from '../schemas';
import { canonicalizeChain, getChainInfo } from '../helpers';
import type { TraceItem } from '../types';
import { post } from '../../../utils/api-client';

export const axelarGmpTxHandlerSchema = {
  destChain: evmChainEnum.describe(
    'Destination chain name (avalanche, arbitrum, ethereum, optimism, base)',
  ),
  agoricAddress: bech32Agoric.describe('Source Agoric address (agoric1...)'),
  size: z
    .number()
    .optional()
    .default(1)
    .describe('Number of results to return'),
};

/**
 * Traces the Axelar GMP (General Message Passing) transaction for account creation.
 * This is Step 1 of the cross-chain flow, where an account is created on the destination
 * EVM chain via Axelar's cross-chain messaging protocol.
 *
 * High-level flow:
 * 1. Query Axelar API for GMP transactions from the source Agoric address
 * 2. Search across configured factory contracts for the destination chain
 * 3. Extract transaction hash and GMP ID from the response
 * 4. Return links to destination chain explorer and Axelarscan for verification
 */
export const axelarGmpTxHandler = async (params: {
  destChain?: string;
  agoricAddress?: string;
  size?: number;
}) => {
  const { destChain: destChainParam, agoricAddress, size = 1 } = params;

  if (!destChainParam || !agoricAddress) {
    return ResponseFormatter.error('Missing required parameters');
  }

  let destChain = destChainParam;

  try {
    destChain = canonicalizeChain(destChain);
    const chainInfo = getChainInfo(destChain);

    if (
      !chainInfo?.FACTORY_CONTRACTS ||
      chainInfo.FACTORY_CONTRACTS.length === 0
    ) {
      return ResponseFormatter.error(
        `No factory contracts configured for chain: ${destChain}`,
      );
    }

    let gmpData: { data?: any[] } | null = null;

    // Try each factory contract until a match is found
    for (const factoryAddress of chainInfo.FACTORY_CONTRACTS) {
      const body = {
        size,
        sourceAddress: agoricAddress,
        address: factoryAddress,
        destinationChain: destChain,
      };

      const data = await post<{ data?: any[] }>(
        'https://api.axelarscan.io/gmp/searchGMP',
        body,
      );

      if (Array.isArray(data?.data) && data.data.length > 0) {
        gmpData = data;
        break;
      }
    }

    if (!gmpData?.data?.length) {
      return ResponseFormatter.success({
        step: 'step1',
        title: 'Axelar GMP (make account)',
        found: false,
        message: 'No GMP transactions found',
        items: [],
      });
    }

    const first = gmpData.data[0];
    const gmpId = first?.call?._id;
    const event = first?.call?.event;
    const destTxHash = first?.approved?.transactionHash;
    const timestamp = first?.call?.timestamp || first?.timestamp;
    const sourceTxHash = first?.call?.transactionHash;

    const items: TraceItem[] = [];

    if (destTxHash && chainInfo.EXPLORER_URL) {
      items.push({
        label: 'Destination Tx',
        value: destTxHash,
        href: `${chainInfo.EXPLORER_URL}${destTxHash}`,
      });
    }

    if (sourceTxHash) {
      items.push({
        label: 'Source Tx',
        value: sourceTxHash,
        href: `https://axelarscan.io/tx/${sourceTxHash}`,
      });
    }

    if (gmpId) {
      items.push({
        label: 'Axelar GMP ID',
        value: gmpId,
        href: `https://axelarscan.io/gmp/${gmpId}`,
      });
    }

    if (event) {
      items.push({ label: 'Event', value: String(event) });
    }

    const sanitizedTx = {
      gmpId: String(gmpId ?? ''),
      event: event ? String(event) : undefined,
      destTxHash: destTxHash ? String(destTxHash) : undefined,
      sourceTxHash: sourceTxHash ? String(sourceTxHash) : undefined,
      timestamp: timestamp ? new Date(timestamp).toISOString() : undefined,
      explorerUrl: destTxHash
        ? `${chainInfo.EXPLORER_URL}${destTxHash}`
        : undefined,
      gmpUrl: gmpId ? `https://axelarscan.io/gmp/${gmpId}` : undefined,
    };

    return ResponseFormatter.success({
      title: 'Axelar GMP (make account)',
      found: true,
      transaction: sanitizedTx,
      items,
    });
  } catch (error) {
    return ResponseFormatter.error(
      `Error tracing Axelar GMP step: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`,
    );
  }
};
