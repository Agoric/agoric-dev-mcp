import { env as cfEnv } from 'cloudflare:workers';
import { get as httpGet } from '../../utils/api-client';
import { EVM_CHAIN_INFO } from './constants';

export const getMintscanHeaders = (): Record<string, string> | null => {
  const { MINTSCAN_ACCESS_TOKEN } = cfEnv as unknown as {
    MINTSCAN_ACCESS_TOKEN?: string;
  };
  return MINTSCAN_ACCESS_TOKEN
    ? { Authorization: `Bearer ${MINTSCAN_ACCESS_TOKEN}` }
    : null;
};

export const getEtherscanApiKey = (): string | null => {
  const { ETHERSCAN_API_KEY } = cfEnv as unknown as {
    ETHERSCAN_API_KEY?: string;
  };
  return ETHERSCAN_API_KEY ?? null;
};

export const normalizeAddress = (s: string): string =>
  (s || '').trim().toLowerCase().replace(/^0x/, '');

export const canonicalizeChain = (chain: string): string =>
  (chain || '').toLowerCase();

// Helper to get chain info from the consolidated lookup table
export const getChainInfo = (
  chain: string,
): {
  CHAIN_ID: number;
  EXPLORER_URL: string;
  FACTORY_CONTRACTS: readonly string[];
  DOMAIN: string;
} | null => {
  const upperChain = (chain || '').toUpperCase() as keyof typeof EVM_CHAIN_INFO;
  return EVM_CHAIN_INFO[upperChain] || null;
};

export const getNobleTxByIbc = async (
  channel?: string | number,
  sequence?: string | number,
): Promise<{ hashes?: string[] }> => {
  if (!channel || !sequence) {
    return { hashes: [] };
  }

  try {
    const baseUrl = 'https://noble-api.polkachu.com/cosmos/tx/v1beta1/txs';
    // Validate inputs to prevent injection
    const sanitizedChannel = String(channel).replace(/'/g, '');
    const sanitizedSequence = String(sequence).replace(/'/g, '');
    const queryValue = `recv_packet.packet_dst_channel='${sanitizedChannel}' AND recv_packet.packet_sequence='${sanitizedSequence}'`;
    const url = new URL(baseUrl);
    url.searchParams.set('pagination.limit', '3');
    url.searchParams.set('limit', '3');
    url.searchParams.set('query', queryValue);

    const response = await httpGet(url.toString(), 'application/json', true, 3);

    const data = response as {
      tx_responses?: Array<{ txhash?: string }>;
    } | null;

    if (!data) {
      return { hashes: [] };
    }

    const hashes = (data.tx_responses ?? [])
      .map((tx) => tx.txhash)
      .filter((h): h is string => Boolean(h));

    return { hashes };
  } catch (error) {
    console.error('Error fetching Noble tx by IBC:', error);
    return { hashes: [] };
  }
};
