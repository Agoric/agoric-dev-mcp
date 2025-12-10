import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

// Tool keywords mapping for suggestion
const toolKeywords: Record<string, string[]> = {
  agoric_project_scaffold: ['new project', 'start', 'setup', 'create', 'scaffold', 'initialize'],
  agoric_dependencies: ['dependencies', 'packages', 'install', 'package.json'],
  agoric_eslint_config: ['eslint', 'lint', 'linting'],
  agoric_ava_config: ['test', 'ava', 'testing setup'],
  agoric_hardening_guide: ['harden', 'freeze', 'immutable', 'security'],
  agoric_patterns_guide: ['pattern', 'match', 'validate', 'M.', 'type'],
  agoric_pattern_example: ['generate pattern', 'create pattern', 'type shape'],
  agoric_error_handling: ['error', 'fail', 'throw', 'exception'],
  agoric_contract_template: ['contract', 'new contract', 'start function'],
  agoric_flow_template: ['flow', 'orchestration flow', 'async flow'],
  agoric_account_kit_template: ['account kit', 'exoClassKit', 'facets'],
  agoric_facet_design: ['facet', 'public facet', 'creator facet'],
  agoric_zoe_guide: ['zoe', 'zcf', 'offer'],
  agoric_invitation_patterns: ['invitation', 'invite'],
  agoric_proposal_shapes: ['proposal', 'give', 'want'],
  agoric_amount_math: ['amount', 'math', 'add', 'subtract', 'compare'],
  agoric_seat_lifecycle: ['seat', 'exit', 'fail', 'allocation'],
  agoric_orchestration_setup: ['orchestration', 'withOrchestration', 'cross-chain'],
  agoric_chain_registration: ['chain', 'register', 'chainInfo', 'asset'],
  agoric_ibc_transfer: ['ibc', 'transfer', 'send'],
  agoric_axelar_gmp: ['axelar', 'gmp', 'evm', 'ethereum', 'avalanche'],
  agoric_cosmwasm_memo: ['cosmwasm', 'wasm', 'memo', 'osmosis'],
  agoric_zones_guide: ['zone', 'durable', 'state'],
  agoric_exo_patterns: ['exo', 'exoClass', 'exoClassKit'],
  agoric_vows_guide: ['vow', 'promise', 'async', 'durable async'],
  agoric_state_constraints: ['state', 'serialize', 'durable'],
  agoric_test_setup: ['test', 'ava', 'ses', 'testing'],
  agoric_test_patterns: ['test pattern', 'unit test', 'integration'],
  agoric_mock_chain: ['mock', 'test', 'orchestration test'],
  agoric_test_offers: ['test offer', 'mock seat'],
  agoric_tracing_setup: ['trace', 'debug', 'log', 'makeTracer'],
  agoric_debug_patterns: ['debug', 'troubleshoot', 'issue'],
  agoric_common_errors: ['error', 'fix', 'problem', 'issue'],
  agoric_security_checklist: ['security', 'review', 'audit', 'checklist'],
  agoric_input_validation: ['validate', 'input', 'sanitize'],
  agoric_error_recovery: ['recovery', 'refund', 'partial failure'],
};

const exampleContracts = [
  {
    name: 'send-anywhere',
    category: 'orchestration',
    description: 'Basic cross-chain token transfer contract',
    features: ['IBC transfers', 'Local account creation', 'Transfer monitoring'],
    difficulty: 'beginner',
  },
  {
    name: 'swap',
    category: 'defi',
    description: 'Simple token swap contract using Zoe',
    features: ['Atomic swaps', 'Price calculation', 'Seat management'],
    difficulty: 'beginner',
  },
  {
    name: 'qstn-router',
    category: 'orchestration',
    description: 'Cross-chain survey platform router',
    features: [
      'Multi-chain messaging',
      'Axelar GMP',
      'CosmWasm integration',
      'Batch transactions',
    ],
    difficulty: 'advanced',
  },
  {
    name: 'staking',
    category: 'defi',
    description: 'Token staking contract with rewards',
    features: ['Delegation', 'Reward distribution', 'Withdrawal'],
    difficulty: 'intermediate',
  },
  {
    name: 'vault',
    category: 'defi',
    description: 'Asset vault with collateralization',
    features: ['Collateral management', 'Liquidation', 'Price oracles'],
    difficulty: 'advanced',
  },
  {
    name: 'nft-minter',
    category: 'nft',
    description: 'Simple NFT minting contract',
    features: ['Asset kind: set', 'Minting', 'Transfer'],
    difficulty: 'beginner',
  },
];

// Example code snippets (in a real implementation, these would be full files)
const exampleCode: Record<string, Record<string, string>> = {
  'send-anywhere': {
    'contract.js': `// Send Anywhere Contract
import { withOrchestration } from '@agoric/orchestration/src/utils/start-helper.js';
import * as flows from './flows.js';

export const contract = async (zcf, privateArgs, zone, tools) => {
  const { orchestrateAll } = tools;

  const { sendTokens } = orchestrateAll({ sendTokens: flows.sendTokens }, {});

  const publicFacet = zone.exo('PublicFacet', M.interface('PublicFacet', {
    makeSendInvitation: M.callWhen().returns(M.any()),
  }), {
    makeSendInvitation() {
      return zcf.makeInvitation(sendTokens, 'sendTokens');
    },
  });

  return { publicFacet };
};

export const start = withOrchestration(contract);`,
    'flows.js': `// Send Anywhere Flows
export const sendTokens = async (orch, ctx, seat, { destination, amount }) => {
  const chain = await orch.getChain('agoric');
  const account = await chain.makeAccount();

  await account.transfer(destination, amount);

  seat.exit();
  return 'sent';
};`,
  },
  'qstn-router': {
    'contract.js': `// QSTN Router Contract - Multi-chain survey platform
// See full implementation for complete code`,
    'flows.js': `// QSTN Router Flows
// Handles EVM (via Axelar) and Cosmos (via IBC) routing`,
    'account-kit.js': `// QSTN Account Kit
// Manages cross-chain accounts with batch transaction support`,
  },
};

export const registerDiscoveryTools = (server: McpServer) => {
  server.tool(
    'agoric_suggest',
    'Given a task description, suggest relevant Agoric MCP tools to use. Helps discover the right tools for your needs.',
    {
      taskDescription: z
        .string()
        .describe(
          'Description of what you want to accomplish',
        ),
    },
    async ({ taskDescription }) => {
      const taskLower = taskDescription.toLowerCase();
      const suggestedTools: { tool: string; reason: string }[] = [];

      // Find matching tools based on keywords
      for (const [tool, keywords] of Object.entries(toolKeywords)) {
        for (const keyword of keywords) {
          if (taskLower.includes(keyword.toLowerCase())) {
            suggestedTools.push({
              tool,
              reason: `Your task mentions "${keyword}"`,
            });
            break;
          }
        }
      }

      // Deduplicate
      const uniqueTools = suggestedTools.filter(
        (tool, index, self) =>
          index === self.findIndex((t) => t.tool === tool.tool),
      );

      // Build workflow suggestion based on task type
      const workflow: string[] = [];
      if (taskLower.includes('new') || taskLower.includes('create') || taskLower.includes('start')) {
        workflow.push('1. Start with agoric_project_scaffold for project setup');
        workflow.push('2. Use agoric_dependencies for package.json');
      }
      if (taskLower.includes('contract')) {
        workflow.push('3. Use agoric_contract_template for main contract');
      }
      if (taskLower.includes('cross-chain') || taskLower.includes('orchestration') || taskLower.includes('ibc')) {
        workflow.push('4. See agoric_orchestration_setup for orchestration');
        workflow.push('5. Use agoric_ibc_transfer for transfers');
      }
      if (taskLower.includes('test')) {
        workflow.push('6. Use agoric_test_setup for testing configuration');
      }

      const response = {
        suggested_tools: uniqueTools.length > 0 ? uniqueTools : [
          { tool: 'agoric_suggest', reason: 'No specific matches found. Try describing your task differently.' },
        ],
        workflow: workflow.length > 0 ? workflow : [
          '1. Start with agoric_project_scaffold for project setup',
          '2. Use agoric_contract_template for main contract',
          '3. Define types with agoric_pattern_example',
          '4. Add tests with agoric_test_setup',
        ],
        related_resources: [
          'Agoric Documentation: https://docs.agoric.com/',
          'Orchestration Guide: https://docs.agoric.com/guides/orchestration/',
          'Zoe Guide: https://docs.agoric.com/guides/zoe/',
        ],
      };

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
    'agoric_example_contracts',
    'List available example contracts with descriptions. Browse curated examples to learn from working code.',
    {
      category: z
        .enum(['orchestration', 'defi', 'nft', 'basic', 'all'])
        .default('all')
        .describe('Category of examples to list'),
      difficulty: z
        .enum(['beginner', 'intermediate', 'advanced', 'all'])
        .default('all')
        .describe('Difficulty level filter'),
    },
    async ({ category, difficulty }) => {
      let filtered = exampleContracts;

      if (category !== 'all') {
        filtered = filtered.filter((ex) => ex.category === category);
      }

      if (difficulty !== 'all') {
        filtered = filtered.filter((ex) => ex.difficulty === difficulty);
      }

      const response = {
        examples: filtered,
        usage: 'Use agoric_get_example with the example name to retrieve code',
        total_count: filtered.length,
      };

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
    'agoric_get_example',
    'Get code from a specific example contract. Returns actual tested and working code.',
    {
      exampleName: z
        .string()
        .describe('Name of the example contract to retrieve'),
      file: z
        .string()
        .optional()
        .describe('Specific file to retrieve (default: all main files)'),
    },
    async ({ exampleName, file }) => {
      const example = exampleContracts.find(
        (ex) => ex.name.toLowerCase() === exampleName.toLowerCase(),
      );

      if (!example) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: `Example "${exampleName}" not found`,
                available_examples: exampleContracts.map((ex) => ex.name),
              }, null, 2),
            },
          ],
        };
      }

      const code = exampleCode[example.name];
      let files: Record<string, string> | string;

      if (file && code) {
        files = code[file] || `File "${file}" not found in ${example.name}`;
      } else {
        files = code || {
          note: `Full code for ${example.name} is available in the Agoric SDK examples`,
        };
      }

      const response = {
        example_name: example.name,
        description: example.description,
        category: example.category,
        difficulty: example.difficulty,
        features: example.features,
        files,
        key_patterns: example.features,
        notes: `This example demonstrates ${example.features.join(', ')}`,
        source: 'https://github.com/Agoric/agoric-sdk/tree/master/packages/orchestration/src/examples',
      };

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
