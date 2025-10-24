import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { makeGetRequest } from '../utils';
import { ResponseFormatter } from '../utils/response-formatter';
import { env } from 'cloudflare:workers';

const ETHERSCAN_API = 'https://api.etherscan.io/v2/api';

export const registerEtherscan = (mcp: McpServer) => {
  const getApiKey = () => {
    const { ETHERSCAN_API_KEY } = env as unknown as {
      ETHERSCAN_API_KEY?: string;
    };
    const key = ETHERSCAN_API_KEY;
    if (!key) throw new Error('Missing ETHERSCAN_API_KEY');
    return key;
  };

  const buildUrl = (params: Record<string, string | number>) => {
    const url = new URL(ETHERSCAN_API);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
    url.searchParams.set('apikey', getApiKey());
    return url.toString();
  };

  const isValidEthAddress = (addr: string) => /^0x[a-fA-F0-9]{40}$/.test(addr);
  const ensure0xHash = (hash: string) => (hash.startsWith('0x') ? hash : `0x${hash}`);

  mcp.tool(
    'etherscan-get-balance',
    'Get native token balance for an EVM address on a chainid.',
    {
      chainid: z.coerce.number().int().positive().describe('EVM chain ID (e.g., 1, 42161, 43114)'),
      address: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid 0x-address').describe('0x-prefixed 40-hex address'),
      tag: z.enum(['latest']).optional().default('latest').describe('Block tag (latest)'),
    },
    async ({ chainid, address, tag = 'latest' }) => {
      try {
        const url = buildUrl({
          chainid,
          module: 'account',
          action: 'balance',
          address,
          tag,
        });
        const response = await makeGetRequest(url);
        return ResponseFormatter.success(response);
      } catch (error) {
        return ResponseFormatter.error(
          `Error fetching Etherscan balance: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    },
  );

  mcp.tool(
    'etherscan-get-token-transfers',
    'List ERC-20 token transfers for an address on a chainid.',
    {
      chainid: z.coerce.number().int().positive(),
      address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
      page: z.coerce.number().int().positive().optional().default(1),
      offset: z.coerce.number().int().positive().max(10000).optional().default(20),
      sort: z.enum(['asc', 'desc']).optional().default('desc'),
    },
    async ({ chainid, address, page = 1, offset = 20, sort = 'desc' }) => {
      try {
        const url = buildUrl({
          chainid,
          module: 'account',
          action: 'tokentx',
          address,
          page,
          offset,
          sort,
        });
        const response = await makeGetRequest(url);
        return ResponseFormatter.success(response);
      } catch (error) {
        return ResponseFormatter.error(
          `Error fetching Etherscan token transfers: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    },
  );

  mcp.tool(
    'etherscan-get-internal-transactions',
    'List internal transactions for an address on a chainid.',
    {
      chainid: z.coerce.number().int().positive(),
      address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
      page: z.coerce.number().int().positive().optional().default(1),
      offset: z.coerce.number().int().positive().max(10000).optional().default(20),
      sort: z.enum(['asc', 'desc']).optional().default('desc'),
    },
    async ({ chainid, address, page = 1, offset = 20, sort = 'desc' }) => {
      try {
        const url = buildUrl({
          chainid,
          module: 'account',
          action: 'txlistinternal',
          address,
          page,
          offset,
          sort,
        });
        const response = await makeGetRequest(url);
        return ResponseFormatter.success(response);
      } catch (error) {
        return ResponseFormatter.error(
          `Error fetching Etherscan internal txs: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    },
  );

  mcp.tool(
    'etherscan-get-normal-transactions',
    'List normal transactions for an address on a chainid.',
    {
      chainid: z.coerce.number().int().positive(),
      address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
      page: z.coerce.number().int().positive().optional().default(1),
      offset: z.coerce.number().int().positive().max(10000).optional().default(20),
      sort: z.enum(['asc', 'desc']).optional().default('desc'),
    },
    async ({ chainid, address, page = 1, offset = 20, sort = 'desc' }) => {
      try {
        const url = buildUrl({
          chainid,
          module: 'account',
          action: 'txlist',
          address,
          page,
          offset,
          sort,
        });
        const response = await makeGetRequest(url);
        return ResponseFormatter.success(response);
      } catch (error) {
        return ResponseFormatter.error(
          `Error fetching Etherscan normal txs: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    },
  );

  mcp.tool(
    'etherscan-get-tx-by-hash',
    'Fetch a transaction by hash via Etherscan Proxy API. If chainid is omitted, tries common chains (1, 42161, 43114). Also fetches receipt and block timestamp.',
    {
      hash: z.string().regex(/^(?:0x)?[a-fA-F0-9]{64}$/).describe('Transaction hash (with or without 0x)'),
      chainid: z.coerce.number().int().positive().optional().describe('Optional chain ID to pin the lookup'),
    },
    async ({ hash, chainid }) => {
      try {
        const txhash = ensure0xHash(hash);
        const candidates = chainid != null ? [Number(chainid)] : [1, 42161, 43114];

        let found: any = null;
        let foundReceipt: any = null;
        let foundBlock: any = null;
        let foundChainId: number | null = null;

        for (const cid of candidates) {
          const txUrl = buildUrl({
            chainid: cid,
            module: 'proxy',
            action: 'eth_getTransactionByHash',
            txhash,
          });
          const txResp = await makeGetRequest(txUrl);
          const tx = txResp?.result || txResp?.data?.result || null;
          if (tx && tx.hash) {
            found = tx;
            foundChainId = cid;

            // Fetch receipt
            try {
              const rUrl = buildUrl({
                chainid: cid,
                module: 'proxy',
                action: 'eth_getTransactionReceipt',
                txhash,
              });
              const rResp = await makeGetRequest(rUrl);
              foundReceipt = rResp?.result || rResp?.data?.result || null;
            } catch {}

            // Fetch block (for timestamp) if blockNumber present
            try {
              const blockNumber = tx?.blockNumber;
              if (typeof blockNumber === 'string') {
                const bUrl = buildUrl({
                  chainid: cid,
                  module: 'proxy',
                  action: 'eth_getBlockByNumber',
                  tag: blockNumber,
                  boolean: 'false',
                });
                const bResp = await makeGetRequest(bUrl);
                const block = bResp?.result || bResp?.data?.result || null;
                if (block && typeof block === 'object') {
                  foundBlock = block;
                }
              }
            } catch {}

            break;
          }
        }

        if (!found) {
          return ResponseFormatter.success({ data: null });
        }

        // Derive timestamp (seconds + ISO)
        let blockTimestamp: number | null = null;
        let blockTimestampIso: string | null = null;
        try {
          const tsHex = foundBlock && typeof foundBlock === 'object' ? foundBlock.timestamp : undefined;
          if (typeof tsHex === 'string') {
            const secs = parseInt(tsHex, 16);
            if (Number.isFinite(secs)) {
              blockTimestamp = secs;
              blockTimestampIso = new Date(secs * 1000).toISOString();
            }
          }
        } catch {}

        return ResponseFormatter.success({
          data: {
            tx: found,
            receipt: foundReceipt,
            block: foundBlock || null,
            blockTimestamp,
            blockTimestampIso,
            chainid: foundChainId,
          },
        });
      } catch (error) {
        return ResponseFormatter.error(
          `Error fetching Etherscan tx by hash: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    },
  );
};