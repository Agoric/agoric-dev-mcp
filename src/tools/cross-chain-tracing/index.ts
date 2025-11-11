import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  axelarGmpTxHandlerSchema,
  axelarGmpTxHandler,
} from './steps/axelar-gmp';
import {
  agoricFundingTxHandlerSchema,
  agoricFundingTxHandler,
} from './steps/agoric-funding';
import {
  cctpNobleTxHandlerSchema,
  cctpNobleTxHandler,
} from './steps/cctp-noble';
import { finalEvmTxHandlerSchema, finalEvmTxHandler } from './steps/final-evm';
import { completeFlowSchema, completeFlowHandler } from './steps/complete-flow';
import {
  fetchPortfolioAddressesSchema,
  fetchPortfolioAddressesHandler,
} from './steps/fetch-portfolio-addresses';

export const registerCrossChainTracing = (mcp: McpServer) => {
  mcp.tool(
    'fetch-portfolio-addresses',
    'Fetches portfolio data from Agoric vstorage and extracts blockchain addresses. Input: portfolio path. Returns: Agoric LCA address, Noble ICA address, and EVM addresses for all supported chains.',
    fetchPortfolioAddressesSchema,
    fetchPortfolioAddressesHandler,
  );

  mcp.tool(
    'trace-axelar-gmp-step',
    'Finds Axelar GMP transaction for account creation on destination EVM chain. Input: destination chain, Agoric address. Returns: GMP transaction hash, destination chain transaction hash, and Axelarscan link.',
    axelarGmpTxHandlerSchema,
    axelarGmpTxHandler,
  );

  mcp.tool(
    'trace-agoric-funding-ack-step',
    'Finds Agoric funding transaction and IBC acknowledgment to Noble ICA. Input: Agoric address, Noble ICA address. Returns: Agoric transaction hash, IBC acknowledgment transaction hash, and funding amount.',
    agoricFundingTxHandlerSchema,
    agoricFundingTxHandler,
  );

  mcp.tool(
    'trace-cctp-noble-step',
    'Finds the CCTP burn transaction on Noble that matches destination chain and EVM address. Returns sanitized transaction info (tx hash, burn amount, domain, timestamp, explorer URL).',
    cctpNobleTxHandlerSchema,
    cctpNobleTxHandler,
  );

  mcp.tool(
    'trace-final-evm-step',
    'Finds the final EVM transaction where USDC is received on the destination chain. Input: destination chain, destination EVM address, optional expected amount. Returns: sanitized transaction object with txHash, explorer link, token transfer amount, and base-unit confirmation.',
    finalEvmTxHandlerSchema,
    finalEvmTxHandler,
  );

  mcp.tool(
    'trace-complete-cross-chain-flow',
    'Returns a sequence of tracing tools to call for complete cross-chain flow. Input: Agoric address, Noble address, destination chain, destination EVM address. Returns: ordered list of tools with parameters to execute.',
    completeFlowSchema,
    completeFlowHandler,
  );
};
