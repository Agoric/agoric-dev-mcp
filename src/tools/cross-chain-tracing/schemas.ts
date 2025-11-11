import { z } from 'zod';

// Strict validation schemas to catch invalid inputs early
export const evmChainEnum = z.enum([
  'avalanche',
  'arbitrum',
  'ethereum',
  'optimism',
  'base',
]);

export const bech32Agoric = z
  .string()
  .regex(/^agoric1[0-9a-z]{38,58}$/i, 'Invalid agoric address');

export const bech32Noble = z
  .string()
  .regex(/^noble1[0-9a-z]{38,58}$/i, 'Invalid noble address');

export const evmAddress = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid EVM address');

export type EvmChain = z.infer<typeof evmChainEnum>;
