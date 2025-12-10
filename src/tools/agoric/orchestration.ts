import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

const orchestrationSetupData = {
  overview:
    'withOrchestration wraps your contract to provide orchestration capabilities',
  imports: [
    "import { withOrchestration } from '@agoric/orchestration/src/utils/start-helper.js';",
    "import { registerChainsAndAssets } from '@agoric/orchestration/src/utils/chain-hub-helper.js';",
    "import { prepareChainHubAdmin } from '@agoric/orchestration/src/exos/chain-hub-admin.js';",
  ],
  contract_signature: {
    before: 'export const start = async (zcf, privateArgs) => { ... }',
    after:
      'export const contract = async (zcf, privateArgs, zone, tools) => { ... };\nexport const start = withOrchestration(contract);',
  },
  tools_provided: {
    chainHub: 'Registry for chain and asset information',
    orchestrateAll: 'Function to register orchestration flows',
    zoeTools:
      'Utilities for Zoe operations (localTransfer, withdrawToSeat)',
    vowTools: 'Utilities for working with Vows',
  },
  setup_pattern: `// 1. Extract chain/asset info from privateArgs
const { chainInfo, assetInfo } = privateArgs;

// 2. Register chains and assets
registerChainsAndAssets(chainHub, zcf.getTerms().brands, chainInfo, assetInfo);

// 3. Create chain hub admin for dynamic registration
const chainHubAdminFacet = prepareChainHubAdmin(zone, chainHub);

// 4. Register flows
const { myFlow } = orchestrateAll(
  { myFlow: flows.myFlow },
  { /* context */ }
);`,
  private_args_requirements: {
    chainInfo: 'Record<string, ChainInfo> - chain configurations',
    assetInfo: '[Denom, DenomDetail][] - asset mappings',
  },
};

const chainRegistrationData = {
  chain_info_structure: {
    description: 'Structure for CosmosChainInfo',
    fields: {
      chainId: "Unique identifier (e.g., 'osmosis-1')",
      stakingTokens: "[{ denom: 'uosmo' }]",
      connections: {
        description: 'IBC connections to other chains',
        structure:
          '{ [otherChainId]: { transferChannel: { channelId, portId, counterpartyChannelId, counterpartyPortId } } }',
      },
    },
    example: `{
  chainId: 'osmosis-1',
  stakingTokens: [{ denom: 'uosmo' }],
  connections: {
    'agoric-3': {
      transferChannel: {
        channelId: 'channel-320',
        portId: 'transfer',
        counterpartyChannelId: 'channel-5',
        counterpartyPortId: 'transfer'
      }
    }
  }
}`,
  },
  asset_info_structure: {
    description: 'Array of [denom, detail] tuples',
    fields: {
      denom: 'Token denomination string',
      detail: '{ brand: brandKey, chainName, baseDenom }',
    },
    example: `[
  ['uosmo', { brand: 'OSMO', chainName: 'osmosis', baseDenom: 'uosmo' }],
  ['ibc/ABC123...', { brand: 'ATOM', chainName: 'cosmoshub', baseDenom: 'uatom' }]
]`,
  },
  registration_code: `// In contract setup
registerChainsAndAssets(
  chainHub,
  zcf.getTerms().brands,
  privateArgs.chainInfo,
  privateArgs.assetInfo
);

// For dynamic registration via creator facet
const chainHubAdmin = prepareChainHubAdmin(zone, chainHub);

// Later...
await chainHubAdmin.registerChain(chainName, chainInfo, connectionInfo);
await chainHubAdmin.registerAsset(denom, detail);`,
  validation: `// Validate chain info exists
if (!chainInfo.osmosis) {
  throw makeError('Osmosis chain info required');
}

// Validate connections exist
const connections = chainInfo.agoric.connections;
if (!connections[chainInfo.osmosis.chainId]) {
  throw makeError('No connection to Osmosis');
}`,
};

const ibcTransferData = {
  basic_transfer: {
    description: 'Simple IBC transfer to an address',
    code: `await account.transfer(
  {
    value: 'osmo1abc...',  // bech32 address
    encoding: 'bech32',
    chainId: 'osmosis-1'
  },
  {
    denom: 'uosmo',
    value: 1000000n  // 1 OSMO in micro units
  }
);`,
  },
  transfer_with_memo: {
    description: 'IBC transfer with memo for routing/instructions',
    code: `const memo = JSON.stringify({
  // Memo content depends on destination
});

await account.transfer(
  { value: destinationAddress, encoding: 'bech32', chainId },
  { denom, value: amount },
  { memo }
);`,
  },
  to_cosmwasm_contract: {
    description: 'IBC transfer that triggers CosmWasm contract execution',
    code: `const memo = JSON.stringify({
  wasm: {
    contract: 'osmo1contractaddress...',
    msg: {
      create_survey: {
        survey_id: 'survey-123',
        owner: 'osmo1owner...',
        reward_amount: 1000000
      }
    }
  }
});

await account.transfer(
  { value: contractAddress, encoding: 'bech32', chainId },
  { denom, value: amount },
  { memo }
);`,
  },
  denom_considerations: {
    description: 'IBC denoms change based on transfer path',
    explanation:
      "When tokens move across IBC, their denom becomes 'ibc/HASH' where HASH is derived from the path",
    helper: `import { denomHash } from '@agoric/orchestration';

const ibcDenom = \`ibc/\${denomHash({
  denom: 'uosmo',
  channelId: 'channel-5'
})}\`;`,
  },
  error_handling: `try {
  await account.transfer(destination, amount, { memo });
  trace('Transfer successful');
} catch (e) {
  trace('Transfer failed:', e);
  // Handle failure - possibly refund user
  throw makeError(\`IBC transfer failed: \${q(e)}\`);
}`,
};

const axelarGmpData = {
  overview:
    'Axelar GMP enables cross-chain messaging to EVM chains from Cosmos',
  message_types: {
    '1': 'MESSAGE_ONLY - Contract call without token transfer',
    '2': 'MESSAGE_WITH_TOKEN - Contract call with token transfer',
    '3': 'TOKEN_ONLY - Pure token transfer without contract call',
  },
  memo_structure: {
    description: 'JSON memo sent via IBC to Axelar',
    fields: {
      destination_chain: "Axelar's chain identifier (e.g., 'avalanche')",
      destination_address: 'Target contract address (0x...)',
      payload: 'ABI-encoded bytes as number array',
      type: 'Message type (1, 2, or 3)',
      fee: 'Optional fee object for types 1 and 2',
    },
    example: `{
  destination_chain: 'avalanche',
  destination_address: '0x1234...',
  payload: [0, 1, 2, ...],  // ABI-encoded
  type: 2,
  fee: {
    amount: '1000000',
    recipient: 'axelar1gasservice...'
  }
}`,
  },
  payload_encoding: {
    description: 'Use viem for ABI encoding',
    imports: "import { encodeAbiParameters, hexToBytes } from 'viem';",
    example: `const abiEncodedData = encodeAbiParameters(
  [
    { type: 'uint256' },  // messageId
    { type: 'string' },   // surveyId
    { type: 'address' },  // owner
    { type: 'uint256' }   // amount
  ],
  [
    BigInt(0),           // CREATE_SURVEY = 0
    'survey-123',
    '0xOwnerAddress',
    BigInt(1000000)
  ]
);

const payload = Array.from(hexToBytes(abiEncodedData));`,
  },
  complete_flow: {
    code: `// 1. Build the payload
const payload = buildGMPPayload(evmMessage);

// 2. Create the memo
const memo = JSON.stringify({
  destination_chain: chainIds[destinationChain],
  destination_address: contracts[destinationChain].quizzler,
  payload,
  type: 2,  // MESSAGE_WITH_TOKEN
  fee: {
    amount: String(feeAmount),
    recipient: gmpAddresses.AXELAR_GAS
  }
});

// 3. Send to Axelar GMP gateway
await account.transfer(
  {
    value: gmpAddresses.AXELAR_GMP,
    encoding: 'bech32',
    chainId: axelarChainId
  },
  { denom, value: totalAmount },
  { memo }
);`,
  },
  fee_handling: {
    description: 'Types 1 and 2 require gas fees paid to Axelar gas service',
    notes: [
      'Fee is sent as part of the transfer amount',
      'Fee recipient is the Axelar gas service address',
      "Type 3 (TOKEN_ONLY) doesn't need fee object",
    ],
  },
};

const cosmwasmMemoData = {
  overview:
    'Call CosmWasm contracts on other Cosmos chains via IBC transfer with wasm memo',
  memo_structure: {
    description: 'Wrap your contract call in a wasm object',
    format: `{
  wasm: {
    contract: 'contract_address',
    msg: { ... }  // Contract-specific execute message
  }
}`,
  },
  examples: {
    create_survey: {
      description: 'Create a survey on a CosmWasm quizzler contract',
      code: `const memo = JSON.stringify({
  wasm: {
    contract: contractAddress,
    msg: {
      create_survey: {
        signature: 'base64signature',
        token: 'token123',
        time_to_expire: 1700000000,
        owner: 'osmo1owner...',
        survey_id: 'survey-123',
        participants_limit: 100,
        reward_denom: 'uosmo',
        reward_amount: 1000000,
        survey_hash: 'hash123',
        manager_pub_key: 'pubkey'
      }
    }
  }
});`,
    },
    cancel_survey: {
      code: `const memo = JSON.stringify({
  wasm: {
    contract: contractAddress,
    msg: {
      cancel_survey: {
        signature: 'base64signature',
        token: 'token123',
        time_to_expire: 1700000000,
        survey_id: 'survey-123',
        manager_pub_key: 'pubkey'
      }
    }
  }
});`,
    },
    pay_rewards: {
      code: `const memo = JSON.stringify({
  wasm: {
    contract: contractAddress,
    msg: {
      pay_rewards: {
        signature: 'base64signature',
        token: 'token123',
        time_to_expire: 1700000000,
        survey_ids: ['survey-1', 'survey-2'],
        participants: ['osmo1user1...', 'osmo1user2...'],
        manager_pub_key: 'pubkey'
      }
    }
  }
});`,
    },
  },
  conventions: {
    naming: 'Use snake_case for Cosmos/CosmWasm message fields',
    addresses: 'Use bech32 format with correct prefix for target chain',
    amounts: 'Usually in micro units (1 OSMO = 1000000 uosmo)',
  },
  transfer_pattern: `await account.transfer(
  {
    value: contractAddress,  // Send directly to contract
    encoding: 'bech32',
    chainId: targetChainId
  },
  {
    denom: transferDenom,
    value: transferAmount
  },
  { memo }
);`,
};

export const registerOrchestrationTools = (server: McpServer) => {
  server.tool(
    'agoric_orchestration_setup',
    'Guide to setting up withOrchestration in contracts. Explains setup code, available tools, and orchestration context.',
    {
      detailLevel: z
        .enum(['quick', 'comprehensive'])
        .default('comprehensive')
        .describe('Level of detail in the response'),
    },
    async ({ detailLevel }) => {
      let response: Record<string, unknown>;

      if (detailLevel === 'quick') {
        response = {
          overview: orchestrationSetupData.overview,
          imports: orchestrationSetupData.imports,
          contract_signature: orchestrationSetupData.contract_signature,
          tools_provided: orchestrationSetupData.tools_provided,
        };
      } else {
        response = orchestrationSetupData;
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response, null, 2),
          },
        ],
      };
    },
  );

  server.tool(
    'agoric_chain_registration',
    'Guide to registering chains and assets in orchestration. Shows chainInfo structure and registration patterns.',
    {
      chainType: z
        .enum(['cosmos', 'evm', 'both'])
        .default('both')
        .describe('Type of chain to register'),
    },
    async ({ chainType }) => {
      let response: Record<string, unknown>;

      if (chainType === 'cosmos') {
        response = {
          chain_info_structure: chainRegistrationData.chain_info_structure,
          asset_info_structure: chainRegistrationData.asset_info_structure,
          registration_code: chainRegistrationData.registration_code,
          validation: chainRegistrationData.validation,
        };
      } else if (chainType === 'evm') {
        response = {
          note: 'EVM chains are accessed via Axelar GMP, not direct registration',
          see_also: 'Use agoric_axelar_gmp tool for EVM chain integration',
          chain_info_structure: {
            description:
              'For Axelar bridge chain registration (cosmos side)',
            example: `{
  chainId: 'axelar-dojo-1',
  connections: {
    'agoric-3': {
      transferChannel: { channelId: 'channel-111', ... }
    }
  }
}`,
          },
        };
      } else {
        response = chainRegistrationData;
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response, null, 2),
          },
        ],
      };
    },
  );

  server.tool(
    'agoric_ibc_transfer',
    'Patterns for IBC transfers in orchestration. Covers transfer code, memo formatting, and multi-hop transfers.',
    {
      transferType: z
        .enum(['basic', 'with_memo', 'to_contract', 'all'])
        .default('all')
        .describe('Type of IBC transfer pattern'),
    },
    async ({ transferType }) => {
      let response: Record<string, unknown>;

      if (transferType === 'basic') {
        response = {
          basic_transfer: ibcTransferData.basic_transfer,
          denom_considerations: ibcTransferData.denom_considerations,
          error_handling: ibcTransferData.error_handling,
        };
      } else if (transferType === 'with_memo') {
        response = {
          transfer_with_memo: ibcTransferData.transfer_with_memo,
          error_handling: ibcTransferData.error_handling,
        };
      } else if (transferType === 'to_contract') {
        response = {
          to_cosmwasm_contract: ibcTransferData.to_cosmwasm_contract,
          denom_considerations: ibcTransferData.denom_considerations,
          error_handling: ibcTransferData.error_handling,
        };
      } else {
        response = ibcTransferData;
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response, null, 2),
          },
        ],
      };
    },
  );

  server.tool(
    'agoric_axelar_gmp',
    'Guide to Axelar GMP (General Message Passing) integration. Covers GMP memo structure, payload encoding, and cross-chain calls.',
    {
      messageType: z
        .enum(['1', '2', '3', 'all'])
        .default('all')
        .describe(
          'GMP message type: 1 (MESSAGE_ONLY), 2 (MESSAGE_WITH_TOKEN), 3 (TOKEN_ONLY)',
        ),
    },
    async ({ messageType }) => {
      let response: Record<string, unknown>;

      if (messageType === 'all') {
        response = axelarGmpData;
      } else {
        const typeDescriptions: Record<string, string> = {
          '1': 'MESSAGE_ONLY - Contract call without token transfer',
          '2': 'MESSAGE_WITH_TOKEN - Contract call with token transfer',
          '3': 'TOKEN_ONLY - Pure token transfer without contract call',
        };

        response = {
          overview: axelarGmpData.overview,
          selected_type: {
            type: messageType,
            description: typeDescriptions[messageType],
          },
          memo_structure: axelarGmpData.memo_structure,
          payload_encoding:
            messageType !== '3' ? axelarGmpData.payload_encoding : undefined,
          complete_flow: axelarGmpData.complete_flow,
          fee_handling:
            messageType !== '3'
              ? axelarGmpData.fee_handling
              : { note: 'Type 3 does not require fee handling' },
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response, null, 2),
          },
        ],
      };
    },
  );

  server.tool(
    'agoric_cosmwasm_memo',
    'Guide to calling CosmWasm contracts via IBC. Covers WASM memo format, payload structure, and common patterns.',
    {
      operation: z
        .enum(['create_survey', 'cancel_survey', 'pay_rewards', 'all'])
        .default('all')
        .describe('Example operation type to show'),
    },
    async ({ operation }) => {
      let response: Record<string, unknown>;

      if (operation === 'all') {
        response = cosmwasmMemoData;
      } else {
        response = {
          overview: cosmwasmMemoData.overview,
          memo_structure: cosmwasmMemoData.memo_structure,
          example:
            cosmwasmMemoData.examples[
              operation as keyof typeof cosmwasmMemoData.examples
            ],
          conventions: cosmwasmMemoData.conventions,
          transfer_pattern: cosmwasmMemoData.transfer_pattern,
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response, null, 2),
          },
        ],
      };
    },
  );
};
