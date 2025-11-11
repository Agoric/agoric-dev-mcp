import OAuthProvider from '@cloudflare/workers-oauth-provider';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { McpAgent } from 'agents/mcp';
import app from './app';
import { registerVstorage } from './tools/vstorage';
import { registerYmax } from './tools/ymax';
import { registerMintscan } from './tools/mintscan';
import { registerAxelar } from './tools/axelar';
import { registerEtherscan } from './tools/etherscan';
import { registerCrossChainTracing } from './tools/cross-chain-tracing';

export class MyMCP extends McpAgent {
  server = new McpServer({
    name: 'Agoric MCP Demo',
    version: '1.0.0',
  });

  declare protected env: any;

  constructor(ctx: DurableObjectState, env: any) {
    super(ctx, env);
    this.env = env;
  }

  async init() {
    registerVstorage(this.server);
    registerYmax(this.server);
    registerMintscan(this.server);
    registerAxelar(this.server);
    registerEtherscan(this.server);
    registerCrossChainTracing(this.server);
  }
}

// 10 years expiry :)
const ttl = 60 * 60 * 24 * 365 * 10;

class CustomProvider extends OAuthProvider {
  fetch = async (request: Request, env: any, ctx: ExecutionContext) => {
    const accessTokenId =
      '6412d00f01eb2d976b01b28ec619dc257e3503a857df346fa5963d4a089e0e1d';
    const grantId = 'pBkzDJ94Fi4Qg6Gn';
    const userEmail = 'user@example.com';

    if (!request.headers.get('Authorization')) {
      const authHeader = `Bearer ${userEmail}:${grantId}:CdnrE4CYOYQMe2GZayM9EG36cfqwzp9E`;
      const createdAt = Math.floor(Date.now() / 1000);

      // biome-ignore lint lint/style/noParameterAssign: need to add auth
      request = new Request(request);
      request.headers.set('Authorization', authHeader);

      await env.OAUTH_KV.put(
        `token:${userEmail}:${grantId}:${accessTokenId}`,
        JSON.stringify({
          id: accessTokenId,
          grantId,
          userId: userEmail,
          createdAt,
          expiresAt: createdAt + ttl,
          wrappedEncryptionKey:
            'OUBVzs4xD7llX1MLjQYThp4zz81Pf066a8gOhxrLTG3ZvocvWuIYAQ==',
          grant: {
            clientId: 'gxVXDhlvskyDdUsN',
            scope: [],
            encryptedProps:
              '+J586wKT7pYbtM4u+5zJxz4bN5UVtLIUrJn/kczCX1IlhtAwpPVEKeaRqAw4xoZf',
          },
        }),
      );
    }

    return await super.fetch(request, env, ctx);
  };
}

const handler = new CustomProvider({
  accessTokenTTL: ttl,
  apiHandlers: {
    '/sse': MyMCP.serveSSE('/sse'),
    '/mcp': MyMCP.serve('/mcp'),
  },
  apiRoute: '/sse',
  authorizeEndpoint: '/authorize',
  clientRegistrationEndpoint: '/register',
  // @ts-ignore
  defaultHandler: app,
  tokenEndpoint: '/token',
});

// Export the OAuth handler as the default
export default handler;
