import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { makeGetRequest } from '../utils';
import { z } from 'zod';
import { ResponseFormatter } from '../utils/response-formatter';

const YDS_API = 'https://ymax-data-service-mainnet.agoric-core.workers.dev';

export const registerYmax = (mcp: McpServer) => {
  mcp.tool(
    'ymax-get-portfolio-history',
    'Fetch portfolio history from the Ymax data service.',
    {
      portfolioId: z
        .string()
        .describe('Portfolio ID to get portfolio for a specific user'),
      duration: z.string().optional().describe('Optional time period duration parameter'),
    },
    async ({ portfolioId, duration = "all" }) => {

      try {
        const response = await makeGetRequest(
          `${YDS_API}/portfolios/${portfolioId}/history?frequency=${duration}`,
        );
        return ResponseFormatter.success(response);
      } catch (error) {
        return ResponseFormatter.error(
          `Error fetching Ymax portfolio data: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    },
  );

  mcp.tool(
    'ymax-get-portfolio-summary',
    'Fetch portfolio summary from the Ymax data service.',
    {
      portfolioId: z
        .string()
        .describe(
          'Portfolio ID to get portfolio summary for a specific user',
        ),
    },
    async ({ portfolioId }) => {

      try {
        const response = await makeGetRequest(
          `${YDS_API}/portfolios/${portfolioId}`,
        );
        return ResponseFormatter.success(response);
      } catch (error) {
        return ResponseFormatter.error(
          `Error fetching Ymax portfolio summary: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    },
  );

  mcp.tool(
    'ymax-get-all-instruments',
    'Fetch information about all instruments (pools) from the Ymax data service.',
    {},
    async () => {
      try {
        const response = await makeGetRequest(`${YDS_API}/instruments`);
        return ResponseFormatter.success(response);
      } catch (error) {
        return ResponseFormatter.error(
          `Error fetching Ymax instruments: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    },
  );

  mcp.tool(
    'ymax-get-instrument',
    'Fetch information about a specific instrument (pool) from the Ymax data service. ',
    {
      instrumentId: z
        .string()
        .describe('The ID of the instrument/pool to fetch information for'),
    },
    async ({ instrumentId }) => {
      try {
        const response = await makeGetRequest(
          `${YDS_API}/instruments/${instrumentId}`,
        );
        return ResponseFormatter.success(response);
      } catch (error) {
        return ResponseFormatter.error(
          `Error fetching Ymax instrument: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    },
  );

  mcp.tool(
    'ymax-get-optimization-candidates',
    'Fetch optimization candidates for a portfolio from the Ymax data service. It can have two modes: options and switches. switches is constrained to just ending one position and starting or expanding another. options can do multiple asset transfers',
    {
      portfolioId: z
        .string()
        .describe('The ID of the portfolio to get optimization candidates for'),
      mode: z
        .string()
        .optional()
        .describe('Optional mode parameter for optimization candidates'),
    },
    async ({ portfolioId, mode = 'options' }) => {
      try {
        const response = await makeGetRequest(
          `${YDS_API}/optimization/candidates?portfolioId=${portfolioId}&mode=${mode}`,
        );
        return ResponseFormatter.success(response);
      } catch (error) {
        return ResponseFormatter.error(
          `Error fetching optimization candidates: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    },
  );

  mcp.tool(
    'ymax-get-portfolio-by-wallet',
    'Fetch portfolio information by wallet address from the Ymax data service.',
    {
      address: z
        .string()
        .describe('The wallet address to get portfolio information for'),
    },
    async ({ address }) => {
      try {
        const response = await makeGetRequest(
          `${YDS_API}/portfolios/by-wallet/${address}`,
        );
        return ResponseFormatter.success(response);
      } catch (error) {
        return ResponseFormatter.error(
          `Error fetching portfolio by wallet: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    },
  );
};
