import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { makeGetRequest } from '../utils';
import { ResponseFormatter } from '../utils/response-formatter';

const MINTSCAN_API = 'https://apis.mintscan.io/v1';

export const registerMintscan = (mcp: McpServer) => {
  const getAuthHeader = () => {
    const token = process.env.MINTSCAN_ACCESS_TOKEN;
    if (!token) throw new Error('Missing MINTSCAN_ACCESS_TOKEN');
    return { Authorization: `Bearer ${token}`, accept: 'application/json' };
  };

  mcp.tool(
    'mintscan-search-transactions-by-hash',
    'Search for a transaction by hash across Mintscan-supported chains.',
    {
      hash: z.string().min(1).describe('Transaction hash to search for'),
    },
    async ({ hash }) => {
      try {
        const url = `${MINTSCAN_API}/search/transactions/${encodeURIComponent(hash)}`;
        const response = await makeGetRequest(url, { headers: getAuthHeader() });
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
      network: z.string().min(1).describe("Mintscan network id (e.g., 'agoric')"),
      hash: z.string().min(1).describe('Transaction hash'),
      height: z.string().optional().describe('Optional block height for the tx'),
    },
    async ({ network, hash, height }) => {
      try {
        const base = `${MINTSCAN_API}/${encodeURIComponent(network)}/txs/${encodeURIComponent(hash)}`;
        const url = height ? `${base}?height=${encodeURIComponent(height)}` : base;
        const response = await makeGetRequest(url, { headers: getAuthHeader() });
        return ResponseFormatter.success(response);
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
      network: z.string().min(1).describe("Mintscan network id (e.g., 'agoric')"),
      address: z.string().min(1).describe('Account address'),
    },
    async ({ network, address }) => {
      try {
        const url = `${MINTSCAN_API}/${encodeURIComponent(network)}/accounts/${encodeURIComponent(address)}`;
        const response = await makeGetRequest(url, { headers: getAuthHeader() });
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
      network: z.string().min(1).describe("Mintscan network id (e.g., 'agoric')"),
      address: z.string().min(1).describe('Account address'),
      take: z.number().int().positive().max(200).optional().default(20).describe('Max number of transactions to return (default 20, max 200)'),
      messageType: z.string().optional().describe('Optional Cosmos SDK message type to filter by (e.g., /cosmos.bank.v1beta1.MsgSend)'),
    },
    async ({ network, address, take = 20, messageType }) => {
      try {
        const url = new URL(`${MINTSCAN_API}/${encodeURIComponent(network)}/accounts/${encodeURIComponent(address)}/transactions`);
        url.searchParams.set('take', String(take));
        if (messageType) {
          // Mintscan expects repeated indices: messageTypes[0]=<type>
          url.searchParams.set('messageTypes[0]', messageType);
        }

        const upstream = await makeGetRequest(url.toString(), { headers: getAuthHeader() });

        // Normalize shape to align with your API usage: { data: { transactions: [...] } }
        const root = upstream?.data ?? upstream;
        const extractTransactions = (r: any): any[] => {
          if (Array.isArray(r)) return r;
          if (Array.isArray(r?.transactions)) return r.transactions;
          if (Array.isArray(r?.txs)) return r.txs;
          if (Array.isArray(r?.data)) return r.data;
          if (Array.isArray(r?.result)) return r.result;
          return [];
        };
        const transactions = extractTransactions(root);

        return ResponseFormatter.success({ data: { transactions } });
      } catch (error) {
        return ResponseFormatter.error(
          `Error fetching Mintscan address transactions: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    },
  );
};