import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { makeGetRequest } from '../utils';
import { z } from 'zod';
import { ResponseFormatter } from '../utils/response-formatter';

const YDS_API = 'https://ymax-data-service.agoric-core.workers.dev';

export const registerYmax = (mcp: McpServer) => {
  mcp.tool(
    'ymax-get-portfolio-history',
    'Fetch portfolio history from the Ymax data service.',
    {
      address: z
        .string()
        .optional()
        .describe(
          'Optional wallet address to get portfolio for a specific user',
        ),
      portfolioId: z
        .string()
        .optional()
        .describe('Optional portfolio ID to get portfolio for a specific user'),
    },
    async ({ address, portfolioId }) => {
      if (!address && !portfolioId) {
        return ResponseFormatter.error(
          'Either address or portfolioId must be provided',
        );
      }

      try {
        const response = await makeGetRequest(
          `${YDS_API}/portfolios/${portfolioId}/history`,
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
      address: z
        .string()
        .optional()
        .describe(
          'Optional wallet address to get portfolio summary for a specific user',
        ),
      portfolioId: z
        .string()
        .optional()
        .describe(
          'Optional portfolio ID to get portfolio summary for a specific user',
        ),
    },
    async ({ address, portfolioId }) => {
      if (!address && !portfolioId) {
        return ResponseFormatter.error(
          'Either address or portfolioId must be provided',
        );
      }

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
    'Fetch information about a specific instrument (pool) from the Ymax data service.',
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
    'Fetch optimization candidates for a portfolio from the Ymax data service. It can have two modes: options and switches.',
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
};
