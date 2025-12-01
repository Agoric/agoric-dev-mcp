import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { env } from 'cloudflare:workers';
import { get as httpGet } from '../utils/api-client';
import { ResponseFormatter } from '../utils/response-formatter';

const MINTSCAN_API = 'https://apis.mintscan.io/v1';
type ToolSchema = Record<string, z.ZodTypeAny>;

const sanitizeLogs = (logs: any[]): any[] => {
  if (!Array.isArray(logs)) return logs;

  return logs.map((log) => ({
    msg_index: log.msg_index ?? null,
    events:
      log.events?.map((ev: any) => ({
        type: ev.type,
        attributes:
          ev.attributes?.map((a: any) => ({
            key: a.key,
            value: a.value,
          })) || [],
      })) || [],
  }));
};

const sanitizeTransaction = (tx: any): any => {
  if (!tx || typeof tx !== 'object') return tx;
  const body = tx.tx?.body || {};

  return {
    txhash: tx.txhash,
    height: tx.height,
    code: tx.code,
    timestamp: tx.timestamp,
    gas_used: tx.gas_used,
    gas_wanted: tx.gas_wanted,
    chain_id: tx.chain_id,
    data: tx.data,

    memo: body.memo || '',
    logs: sanitizeLogs(tx.logs || []),

    // Fields intentionally omitted:
    // - tx.codespace (empty)
    // - tx.info (empty)
    // - tx.tx.auth_info (keys, signatures)
    // - tx.tx.signatures
    // - tx.tx.body.extension_options
    // - tx.tx.body.non_critical_extension_options
    // - tx.tx./cosmos-tx-v1beta1-Tx redundant wrapper
  };
};

export const registerMintscan = (mcp: McpServer) => {
  const getAuthHeaders = (): Record<string, string> => {
    const { MINTSCAN_ACCESS_TOKEN } = env as unknown as {
      MINTSCAN_ACCESS_TOKEN?: string;
    };
    const token = MINTSCAN_ACCESS_TOKEN;
    if (!token) throw new Error('Missing MINTSCAN_ACCESS_TOKEN');
    return { Authorization: `Bearer ${token}` };
  };

  mcp.tool(
    'mintscan-search-transactions-by-hash',
    'Search for a transaction by hash across Mintscan-supported chains.',
    {
      hash: z.string().min(1).describe('Transaction hash to search for'),
    } as ToolSchema,
    async ({ hash }) => {
      try {
        const url = `${MINTSCAN_API}/search/transactions/${encodeURIComponent(hash)}`;
        const response = await httpGet(
          url,
          'application/json',
          true,
          3,
          getAuthHeaders(),
        );
        return ResponseFormatter.success(response);
      } catch (error) {
        return ResponseFormatter.error(
          `Error searching Mintscan transactions: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    },
  );

  mcp.tool(
    'mintscan-get-network-tx-details',
    'Fetch detailed transaction information for a given network and tx hash.',
    {
      network: z
        .string()
        .min(1)
        .describe("Mintscan network id (e.g., 'agoric')"),
      hash: z.string().min(1).describe('Transaction hash'),
      height: z
        .string()
        .optional()
        .describe('Optional block height for the tx'),
    } as ToolSchema,
    async ({ network, hash, height }) => {
      try {
        const base = `${MINTSCAN_API}/${encodeURIComponent(network)}/txs/${encodeURIComponent(hash)}`;
        const url = height
          ? `${base}?height=${encodeURIComponent(height)}`
          : base;
        const response = await httpGet(
          url,
          'application/json',
          true,
          3,
          getAuthHeaders(),
        );
        console.log(Object.keys(response as any));
        const tx = response as unknown[];

        const sanitized =
          tx.length > 0
            ? sanitizeTransaction(tx[0])
            : { message: 'No transaction data found' };

        return ResponseFormatter.success({ data: sanitized });
      } catch (error) {
        return ResponseFormatter.error(
          `Error fetching Mintscan tx details: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    },
  );

  mcp.tool(
    'mintscan-get-account',
    'Fetch account information (including bank balances) from Mintscan for a given address.',
    {
      network: z
        .string()
        .min(1)
        .describe("Mintscan network id (e.g., 'agoric')"),
      address: z.string().min(1).describe('Account address'),
    } as ToolSchema,
    async ({ network, address }) => {
      try {
        const url = `${MINTSCAN_API}/${encodeURIComponent(network)}/accounts/${encodeURIComponent(address)}`;
        const response = await httpGet(
          url,
          'application/json',
          true,
          3,
          getAuthHeaders(),
        );
        return ResponseFormatter.success(response);
      } catch (error) {
        return ResponseFormatter.error(
          `Error fetching Mintscan account: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    },
  );

  mcp.tool(
    'mintscan-get-address-transactions',
    'Fetch recent transactions for an address on a given network. Optionally filter by message type.',
    {
      network: z
        .string()
        .min(1)
        .describe("Mintscan network id (e.g., 'agoric')"),
      address: z.string().min(1).describe('Account address'),
      take: z
        .number()
        .int()
        .positive()
        .max(200)
        .optional()
        .default(20)
        .describe('Max number of transactions to return (default 20, max 200)'),
      messageType: z
        .string()
        .optional()
        .describe(
          'Optional Cosmos SDK message type to filter by (e.g., /cosmos.bank.v1beta1.MsgSend)',
        ),
    } as ToolSchema,
    async ({ network, address, take = 20, messageType }) => {
      try {
        const url = new URL(
          `${MINTSCAN_API}/${encodeURIComponent(network)}/accounts/${encodeURIComponent(address)}/transactions`,
        );
        url.searchParams.set('take', String(take));
        if (messageType) {
          // Mintscan expects repeated indices: messageTypes[0]=<type>
          url.searchParams.set('messageTypes[0]', messageType);
        }

        const upstream = await httpGet(
          url.toString(),
          'application/json',
          true,
          3,
          getAuthHeaders(),
        );

        // Normalize shape to align with your API usage: { data: { transactions: [...] } }
        const root = (upstream as any)?.data ?? upstream;
        const extractTransactions = (r: any): any[] => {
          if (Array.isArray(r)) return r;
          if (Array.isArray(r?.transactions)) return r.transactions;
          if (Array.isArray(r?.txs)) return r.txs;
          if (Array.isArray(r?.data)) return r.data;
          if (Array.isArray(r?.result)) return r.result;
          return [];
        };
        const transactions = extractTransactions(root);

        const sanitized = transactions.map(sanitizeTransaction);

        return ResponseFormatter.success({
          data: { transactions: sanitized },
        });
      } catch (error) {
        return ResponseFormatter.error(
          `Error fetching Mintscan address transactions: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    },
  );
};
