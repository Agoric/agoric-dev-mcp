// Chain configuration constants
export const EVM_CHAIN_INFO = {
  AVALANCHE: {
    CHAIN_ID: 43114,
    EXPLORER_URL: 'https://snowscan.xyz/tx/',
    FACTORY_CONTRACTS: [
      '0x647Ead1a35dbC2b0160Cbe6e565f25C4915a125F',
      '0x13cA288486f2bb6B3619c5fd6A2917Ec98a41E7f',
    ],
    DOMAIN: '1',
  },
  ARBITRUM: {
    CHAIN_ID: 42161,
    EXPLORER_URL: 'https://arbiscan.io/tx/',
    FACTORY_CONTRACTS: [
      '0x647Ead1a35dbC2b0160Cbe6e565f25C4915a125F',
      '0x51e589D94b51d01B75442AE1504cD8c50d6127C9',
    ],
    DOMAIN: '3',
  },
  ETHEREUM: {
    CHAIN_ID: 1,
    EXPLORER_URL: 'https://etherscan.io/tx/',
    FACTORY_CONTRACTS: [
      '0x647Ead1a35dbC2b0160Cbe6e565f25C4915a125F',
      '0x3bF3056835f7C25b1f71aff99B734Ad07d644577',
      '0x6ca3e8BFe9196A463136cB2442672e46BBe00BCc',
    ],
    DOMAIN: '0',
  },
  OPTIMISM: {
    CHAIN_ID: 10,
    EXPLORER_URL: 'https://optimistic.etherscan.io/tx/',
    FACTORY_CONTRACTS: ['0x6ca3e8BFe9196A463136cB2442672e46BBe00BCc'],
    DOMAIN: '2',
  },
  BASE: {
    CHAIN_ID: 8453,
    EXPLORER_URL: 'https://basescan.org/tx/',
    FACTORY_CONTRACTS: ['0x724fB9Fd9876d12Da33223C84E7Abf46fFc159C1'],
    DOMAIN: '6',
  },
} as const;

export enum LogEventType {
  RecvPacket = 'recv_packet',
  WriteAcknowledgement = 'write_acknowledgement',
  FungibleTokenPacket = 'fungible_token_packet',
}
