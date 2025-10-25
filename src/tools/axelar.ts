import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ResponseFormatter } from '../utils/response-formatter';

const AXELAR_API = 'https://api.axelarscan.io';

export const registerAxelar = (mcp: McpServer) => {
  mcp.tool(
    'axelar-gmp-search',
    'Search Axelar GMP events. Filter by sourceAddress, destinationChain, and destination contract address.',
    {
      size: z.coerce.number().int().positive().max(100).optional().describe('Max results to return (default per upstream or 1).'),
      sourceAddress: z.string().optional().describe('Source chain caller address (e.g., agoric1... or 0x...).'),
      address: z.string().optional().describe('Destination chain contract address (e.g., factory contract).'),
      destinationChain: z.string().optional().describe('Destination chain (e.g., avalanche | arbitrum | ethereum).'),
    },
    async ({ size, sourceAddress, address, destinationChain }) => {
      try {
        const body: Record<string, unknown> = {};
        if (size != null) body.size = size;
        if (sourceAddress) body.sourceAddress = sourceAddress;
        if (address) body.address = address;
        if (destinationChain) body.destinationChain = destinationChain;

        const res = await fetch(`${AXELAR_API}/gmp/searchGMP`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });

        const text = await res.text();
        const json = (() => { try { return JSON.parse(text); } catch { return { raw: text }; } })();

        if (!res.ok) {
          return ResponseFormatter.error(
            `Axelar upstream error (${res.status}): ${typeof json === 'string' ? json : JSON.stringify(json).slice(0, 2000)}`
          );
        }
        return ResponseFormatter.success(json);
      } catch (error) {
        return ResponseFormatter.error(
          `Error searching Axelar GMP: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    },
  );
};