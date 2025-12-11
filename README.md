# Agoric Dev MCP Server

An MCP (Model Context Protocol) server that provides AI assistants with tools for Agoric smart contract development. This server enables Claude and other MCP-compatible AI assistants to help developers build, test, debug, and deploy smart contracts on the Agoric blockchain.

## Features

The server provides tools across 10 categories:

- **Project Setup** - Initialize and configure Agoric projects
- **Core Patterns** - Agoric development patterns and best practices
- **Contract Structure** - Smart contract scaffolding and structure
- **Zoe & ERTP** - Zoe contract framework and ERTP asset handling
- **Orchestration** - Cross-chain orchestration capabilities
- **Durability** - Durable object patterns for upgrade-safe contracts
- **Testing** - Contract testing utilities and patterns
- **Debugging & Tracing** - Debug and trace contract execution
- **Security** - Security best practices and vulnerability checks
- **Discovery & Help** - Documentation and API discovery

## Quick Start (Claude Code)

```bash
claude mcp add --transport sse agoric-dev https://agoric-dev-mcp.agoric-core.workers.dev/sse
```

For local development, use `http://localhost:8787/sse` instead.

## Develop locally

```bash
# install dependencies
yarn install

# run locally
yarn start
```

You should be able to open [`http://localhost:8787/`](http://localhost:8787/) in your browser

## Connect the MCP inspector to your server

To explore your new MCP api, you can use the [MCP Inspector](https://modelcontextprotocol.io/docs/tools/inspector).

- Start it with `npx @modelcontextprotocol/inspector`
- [Within the inspector](http://localhost:5173), switch the Transport Type to `SSE` and enter `http://localhost:8787/sse` as the URL of the MCP server to connect to, and click "Connect"
- You will navigate to a (mock) user/password login screen. Input any email and pass to login.
- You should be redirected back to the MCP Inspector and you can now list and call any defined tools!

## Connect Claude Desktop to your local MCP server

The MCP inspector is great, but we really want to connect this to Claude! Follow [Anthropic's Quickstart](https://modelcontextprotocol.io/quickstart/user) and within Claude Desktop go to Settings > Developer > Edit Config to find your configuration file.

Open the file in your text editor and replace it with this configuration:

```json
{
  "mcpServers": {
    "math": {
      "command": "npx",
      "args": ["mcp-remote", "http://localhost:8787/sse"]
    }
  }
}
```

This will run a local proxy and let Claude talk to your MCP server over HTTP

When you open Claude a browser window should open and allow you to login. You should see the tools available in the bottom right. Given the right prompt Claude should ask to call the tool.

## Deploy to Cloudflare

1. `npx wrangler kv namespace create OAUTH_KV`
2. Follow the guidance to add the kv namespace ID to `wrangler.jsonc`
3. `npm run deploy`

## Call your newly deployed remote MCP server from a remote MCP client

Just like you did above in "Develop locally", run the MCP inspector:

`npx @modelcontextprotocol/inspector@latest`

Then enter the `workers.dev` URL (ex: `worker-name.account-name.workers.dev/sse`) of your Worker in the inspector as the URL of the MCP server to connect to, and click "Connect".

You've now connected to your MCP server from a remote MCP client.

## Connect Claude Desktop to your remote MCP server

Update the Claude configuration file to point to your `workers.dev` URL (ex: `worker-name.account-name.workers.dev/sse`) and restart Claude

```json
{
  "mcpServers": {
    "math": {
      "command": "npx",
      "args": ["mcp-remote", "https://worker-name.account-name.workers.dev/sse"]
    }
  }
}
```

## Debugging

Should anything go wrong it can be helpful to restart Claude, or to try connecting directly to your
MCP server on the command line with the following command.

```bash
npx mcp-remote http://localhost:8787/sse
```

In some rare cases it may help to clear the files added to `~/.mcp-auth`

```bash
rm -rf ~/.mcp-auth
```
