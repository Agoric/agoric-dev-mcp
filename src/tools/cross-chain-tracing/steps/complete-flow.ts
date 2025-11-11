import { z } from 'zod';
import { ResponseFormatter } from '../../../utils/response-formatter';
import {
  evmChainEnum,
  bech32Agoric,
  bech32Noble,
  evmAddress,
} from '../schemas';
import { canonicalizeChain } from '../helpers';

export const completeFlowSchema = {
  agoricAddress: bech32Agoric.describe('Source Agoric address (agoric1...)'),
  nobleAddress: bech32Noble.describe('Noble ICA address (noble1...)'),
  destChain: evmChainEnum.describe(
    'Destination chain name (avalanche, arbitrum, ethereum, optimism, base)',
  ),
  destinationEvmAddress: evmAddress.describe('Destination EVM address (0x...)'),
  positionName: z
    .string()
    .optional()
    .describe('Position name (e.g., USDN for special handling)'),
};

/**
 * Builds a complete tracing plan for a cross-chain transfer from Agoric → Noble → EVM chain.
 * It does not perform blockchain queries; instead, it returns an ordered list of
 * tracing tools that should be executed to reconstruct the full flow.
 */
export const completeFlowHandler = async (params: {
  agoricAddress?: string;
  nobleAddress?: string;
  destChain?: string;
  destinationEvmAddress?: string;
  positionName?: string;
}) => {
  const {
    agoricAddress,
    nobleAddress,
    destChain: destChainParam,
    destinationEvmAddress,
    positionName,
  } = params;
  if (
    !agoricAddress ||
    !nobleAddress ||
    !destChainParam ||
    !destinationEvmAddress
  ) {
    return ResponseFormatter.error('Missing required parameters');
  }
  let destChain = destChainParam;
  try {
    destChain = canonicalizeChain(destChain);

    // Handle USDN special case
    if (positionName === 'USDN') {
      return ResponseFormatter.success({
        flow: 'USDN',
        message:
          'USDN flow uses different steps: Agoric funding + IBC ACK, then Noble swap',
        recommendedSequence: [
          {
            tool: 'trace-agoric-funding-ack-step',
            params: { agoricAddress, nobleAddress, take: 20 },
            description: 'Find Agoric funding and IBC acknowledgment to Noble',
          },
          {
            tool: 'mintscan-get-address-transactions',
            params: {
              network: 'noble',
              address: nobleAddress,
              messageType: 'noble.swap.v1.Swapped',
            },
            description: 'Find Noble swap transaction (USDC <> USDN)',
          },
        ],
      });
    }

    // Standard cross-chain flow
    return ResponseFormatter.success({
      flow: 'cross-chain',
      agoricAddress,
      nobleAddress,
      destChain,
      destinationEvmAddress,
      message:
        'Execute these tools in sequence to trace the complete cross-chain flow:',
      recommendedSequence: [
        {
          step: 1,
          tool: 'trace-axelar-gmp-step',
          params: { destChain, agoricAddress, size: 1 },
          description:
            'Find Axelar GMP transaction for account creation on destination chain',
        },
        {
          step: 2,
          tool: 'trace-agoric-funding-ack-step',
          params: { agoricAddress, nobleAddress, take: 20 },
          description:
            'Find Agoric funding transaction and IBC acknowledgment to Noble ICA',
        },
        {
          step: 3,
          tool: 'trace-cctp-noble-step',
          params: {
            nobleAddress,
            destChain,
            destinationEvmAddress,
            take: 20,
          },
          description: 'Find CCTP burn transaction on Noble',
        },
        {
          step: 4,
          tool: 'trace-final-evm-step',
          params: { destChain, destinationEvmAddress },
          description:
            'Find final EVM transaction (add expectedAmount from step 3 if available)',
        },
      ],
      notes: [
        'Execute tools in order as each step may provide data needed for the next',
        'Step 3 returns burnAmount which should be passed as expectedAmount to step 4',
        'Each tool returns structured data with found/items/error fields',
      ],
    });
  } catch (error) {
    return ResponseFormatter.error(
      `Error generating cross-chain flow instructions: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
};
