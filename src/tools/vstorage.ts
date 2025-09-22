import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { makeGetRequest } from '../utils';
import { z } from 'zod';

const MAIN_API = 'https://main-a.api.agoric.net';

export const registerVstorage = (mcp: McpServer) => {
  mcp.tool(
    'fetch-information-from-vstorage',
    "Fetch and parse data from any arbitrary vstorage path. This tool automatically tries to fetch both data content and children list for comprehensive results. Can be used to query any vstorage endpoint by providing the full path (e.g., 'published.ymax0.portfolios', 'published.wallet.agoric1abc123', etc.)",
    {
      path: z
        .string()
        .describe(
          "The vstorage path to fetch data from (e.g., 'published.ymax0.portfolios')",
        ),
    },
    async ({ path }) => {
      const baseUrl = `${MAIN_API}/agoric/vstorage`;
      const result: { data?: any; children?: any; errors?: string[] } = {
        errors: [],
      };

      try {
        const dataResponse = (await makeGetRequest(
          `${baseUrl}/data/${path}`,
        )) as any;
        result.data = dataResponse;
      } catch (error) {
        result.errors.push('Error fetching vstorage data.');
        console.error('Error fetching vstorage data.');
      }

      try {
        const childrenResponse = (await makeGetRequest(
          `${baseUrl}/children/${path}`,
        )) as any;
        result.children = childrenResponse.children;
      } catch (error) {
        result.errors.push('Error fetching vstorage children.');
        console.error('Error fetching vstorage children');
      }

      if (!result.data && !result.children) {
        return {
          content: [
            {
              type: 'text',
              text: result.errors
                ? `No data found. Errors: ${result.errors.join(', ')}`
                : 'No data or children found for the given vstorage path',
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    },
  );
};
