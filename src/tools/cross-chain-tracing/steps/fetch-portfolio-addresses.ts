import { z } from 'zod';
import { ResponseFormatter } from '../../../utils/response-formatter';
import { makeGetRequest } from '../../../utils';

const MAIN_API = 'https://main-a.api.agoric.net';

export const fetchPortfolioAddressesSchema = {
  portfolioPath: z
    .string()
    .describe(
      'Full vstorage portfolio path (e.g., published.ymax0.portfolios.portfolio0 or published.ymax1.portfolios.portfolio0)',
    ),
  network: z
    .string()
    .optional()
    .default('main')
    .describe('Network to query (default: main)'),
};

/**
 * Extracts blockchain addresses from an Agoric portfolio vstorage path.
 * This tool queries the Agoric vstorage API to retrieve all relevant addresses
 * (Agoric LCA, Noble ICA, and EVM addresses) needed for cross-chain tracing.
 *
 * High-level flow:
 * 1. Fetch portfolio data from vstorage API
 * 2. Parse nested JSON structure to extract accountIdByChain
 * 3. Extract addresses for Agoric, Noble, and supported EVM chains
 * 4. Determine destination chain from position name
 * 5. Return structured address data ready for use with trace-complete-cross-chain-flow
 */

function extractChainFromPosition(position: string): string | null {
  if (position === 'USDN') return 'noble';
  const parts = position.split('_');
  if (parts.length !== 2) return null;
  return parts[1]?.toLowerCase() || null;
}

function extractAgoricLCAAddress(portfolio: any): string | null {
  const id = portfolio?.accountIdByChain?.agoric;
  if (typeof id !== 'string' || !id) return null;
  return id.split(':').at(-1) || null;
}

function extractNobleAddress(portfolio: any): string | null {
  const id = portfolio?.accountIdByChain?.noble;
  if (typeof id !== 'string' || !id) return null;
  return id.split(':').at(-1) || null;
}

function extractEvmAddress(portfolio: any, evmChain: string): string | null {
  if (!evmChain) return null;

  const entries = Object.entries(portfolio?.accountIdByChain ?? {}) as Array<
    [string, unknown]
  >;
  const accountIdByChainLower: Record<string, string> = entries.reduce(
    (acc, [k, v]) => {
      if (typeof k === 'string' && typeof v === 'string')
        acc[k.toLowerCase()] = v;
      return acc;
    },
    {} as Record<string, string>,
  );

  const id = accountIdByChainLower[evmChain.toLowerCase()];
  if (typeof id !== 'string' || !id) return null;
  return id.split(':').at(-1) || null;
}

export const fetchPortfolioAddressesHandler = async (params: {
  portfolioPath?: string;
  network?: string;
}) => {
  const { portfolioPath } = params;

  if (!portfolioPath) {
    return ResponseFormatter.error('Missing required parameter: portfolioPath');
  }

  try {
    const baseUrl = MAIN_API;

    const url = `${baseUrl}/agoric/vstorage/data/${portfolioPath}`;
    const response = (await makeGetRequest(url)) as any;
    if (!response?.value) {
      return ResponseFormatter.error(
        'Portfolio not found or invalid vstorage path',
      );
    }

    let portfolio: any = null;
    try {
      const rawValue = response.value;

      if (typeof rawValue === 'string') {
        const parsed = JSON.parse(rawValue);

        if (
          parsed?.values &&
          Array.isArray(parsed.values) &&
          parsed.values.length > 0
        ) {
          const latestValue = parsed.values[parsed.values.length - 1];
          const bodyStr =
            typeof latestValue === 'string'
              ? latestValue
              : JSON.stringify(latestValue);

          const cleanBody = bodyStr.startsWith('#')
            ? bodyStr.slice(1)
            : bodyStr;
          const bodyData = JSON.parse(cleanBody);

          if (bodyData?.body) {
            const finalBody =
              typeof bodyData.body === 'string'
                ? bodyData.body.startsWith('#')
                  ? bodyData.body.slice(1)
                  : bodyData.body
                : JSON.stringify(bodyData.body);
            portfolio = JSON.parse(finalBody);
          } else {
            portfolio = bodyData;
          }
        } else {
          const cleanValue = rawValue.startsWith('#')
            ? rawValue.slice(1)
            : rawValue;
          portfolio = JSON.parse(cleanValue);
        }
      } else {
        portfolio = rawValue;
      }
    } catch (parseError) {
      return ResponseFormatter.error(
        `Failed to parse portfolio data: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`,
      );
    }

    const agoricAddress = extractAgoricLCAAddress(portfolio);
    const nobleAddress = extractNobleAddress(portfolio);

    const evmAddresses: Record<string, string> = {};
    const supportedChains = [
      'avalanche',
      'arbitrum',
      'ethereum',
      'optimism',
      'base',
    ];

    for (const chain of supportedChains) {
      const addr = extractEvmAddress(portfolio, chain);
      if (addr) {
        evmAddresses[chain] = addr;
      }
    }

    const positionKeys = Array.isArray(portfolio?.positionKeys)
      ? portfolio.positionKeys
      : [];
    const positionName = positionKeys.length > 0 ? positionKeys[0] : null;
    const destChain = positionName
      ? extractChainFromPosition(positionName)
      : null;
    const destinationEvmAddress = destChain ? evmAddresses[destChain] : null;

    return ResponseFormatter.success({
      portfolioPath,
      agoricAddress,
      nobleAddress,
      evmAddresses,
      positionKeys,
      positionName,
      destChain,
      destinationEvmAddress,
      accountIdByChain: portfolio?.accountIdByChain || {},
      message:
        'Use these addresses with the trace-complete-cross-chain-flow tool',
      nextSteps: {
        tool: 'trace-complete-cross-chain-flow',
        params: {
          agoricAddress,
          nobleAddress,
          destChain:
            destChain ||
            '<choose from: ' + Object.keys(evmAddresses).join(', ') + '>',
          destinationEvmAddress:
            destinationEvmAddress ||
            '<use corresponding address from evmAddresses>',
          positionName: positionName || undefined,
        },
      },
    });
  } catch (error) {
    return ResponseFormatter.error(
      `Error fetching portfolio addresses: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
};
