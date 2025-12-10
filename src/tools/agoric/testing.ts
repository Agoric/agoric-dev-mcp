import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

const testSetupData = {
  package_json_config: {
    ava: {
      extensions: { js: true, ts: 'module' },
      nodeArguments: ['--loader=ts-blank-space/register', '--no-warnings'],
      require: ['@endo/init/debug.js'],
      files: ['test/**/test-*.*', 'test/**/*.test.*'],
      timeout: '20m',
      workerThreads: false,
    },
  },
  critical_settings: {
    '@endo/init/debug.js': 'Initializes SES environment - REQUIRED',
    'workerThreads: false': "SES doesn't work with worker threads",
    timeout: 'Orchestration tests can be slow',
  },
  basic_test_file: `// @ts-check
import { test } from '@agoric/zoe/tools/prepare-test-env-ava.js';
import { makeTracer } from '@agoric/internal';

const trace = makeTracer('Test');

test('basic test', async t => {
  t.pass();
});

test('pattern matching', async t => {
  const { M, mustMatch } = await import('@endo/patterns');

  const value = { name: 'test', count: 5 };
  const pattern = M.splitRecord({
    name: M.string(),
    count: M.number()
  });

  t.notThrows(() => mustMatch(value, pattern));
});`,
  test_commands: {
    all: 'yarn test',
    single_file: 'yarn test test/test-myfile.js',
    watch: 'yarn test --watch',
  },
};

const testPatternsData = {
  unit_tests: {
    description: 'Test pure functions and utilities',
    example: `test('validates addresses correctly', t => {
  t.true(isValidEvmAddress('0x' + 'a'.repeat(40)));
  t.false(isValidEvmAddress('invalid'));
  t.false(isValidEvmAddress('0x' + 'a'.repeat(39)));
});

test('builds GMP payload', t => {
  const payload = buildGMPPayload(testMessage);
  t.true(Array.isArray(payload));
  t.true(payload.length > 0);
});`,
  },
  pattern_tests: {
    description: 'Test Endo pattern matching',
    example: `test('MessageShape validates correct messages', t => {
  const validMessage = {
    destinationChain: 'Osmosis',
    chainType: 'cosmos',
    type: 2,
    amountForChain: '1000000',
    amountFee: '0',
    payload: { msg: { ... } }
  };

  t.notThrows(() => mustMatch(validMessage, MessageShape));
});

test('MessageShape rejects invalid messages', t => {
  const invalidMessage = { destinationChain: 'Unknown' };

  t.throws(() => mustMatch(invalidMessage, MessageShape));
});`,
  },
  mock_patterns: {
    description: 'Mocking for isolation',
    example: `const mockAccount = Far('MockAccount', {
  getAddress: () => ({ value: 'agoric1test...' }),
  transfer: async () => 'success',
  send: async () => 'sent'
});

const mockOrchestrator = Far('MockOrchestrator', {
  getChain: async (name) => ({
    makeAccount: async () => mockAccount,
    getChainInfo: async () => ({ chainId: 'agoric-test' }),
    getVBankAssetInfo: async () => []
  })
});`,
  },
  contract_tests: {
    description: 'Test contract behavior with Zoe',
    example: `import { makeZoeKitForTest } from '@agoric/zoe/tools/setup-zoe.js';
import { E } from '@endo/far';

test('contract starts correctly', async t => {
  const { zoe, bundleAndInstall } = await makeZoeKitForTest(t);

  const installation = await bundleAndInstall('./src/contract.js');
  const { publicFacet } = await E(zoe).startInstance(installation);

  const status = await E(publicFacet).getStatus();
  t.is(status, 'active');
});`,
  },
};

const mockChainData = {
  mock_account: {
    code: `import { Far } from '@endo/far';

const makeMockAccount = (address = 'agoric1test123') => Far('MockAccount', {
  getAddress: () => ({
    value: address,
    chainId: 'agoric-test',
    encoding: 'bech32'
  }),
  transfer: async (destination, amount, opts) => {
    // Track calls for assertions
    return 'transfer-success';
  },
  send: async (toAccount, amount) => {
    return 'send-success';
  },
  monitorTransfers: async (tap) => {
    // Store tap for later simulation
  },
  deposit: async (payment) => {
    return 'deposited';
  }
});`,
  },
  mock_chain: {
    code: `const makeMockChain = (chainName, chainId) => Far('MockChain', {
  makeAccount: async () => makeMockAccount(),
  getChainInfo: async () => ({
    chainId,
    stakingTokens: [{ denom: \`u\${chainName}\` }]
  }),
  getVBankAssetInfo: async () => [
    { brand: mockBrands.BLD, denom: 'ubld' }
  ]
});`,
  },
  mock_orchestrator: {
    code: `const makeMockOrchestrator = (chains = {}) => Far('MockOrchestrator', {
  getChain: async (chainName) => {
    if (chains[chainName]) {
      return chains[chainName];
    }
    return makeMockChain(chainName, \`\${chainName}-test-1\`);
  }
});`,
  },
  usage: `test('flow creates account', async t => {
  const mockOrch = makeMockOrchestrator();
  const mockSeat = makeMockSeat();

  const result = await flows.createAccount(
    mockOrch,
    { makeAccountKit: mockMakeAccountKit },
    mockSeat
  );

  t.truthy(result.invitationMakers);
});`,
};

const testOffersData = {
  mock_seat: {
    code: `const makeMockSeat = (proposal = { give: {}, want: {} }) => {
  let exited = false;
  let failed = false;
  let failReason = null;

  return Far('MockSeat', {
    getProposal: () => proposal,
    getCurrentAllocation: () => ({}),
    hasExited: () => exited,
    exit: () => { exited = true; },
    fail: (reason) => {
      failed = true;
      failReason = reason;
      exited = true;
    },
    // Test helpers
    didExit: () => exited,
    didFail: () => failed,
    getFailReason: () => failReason
  });
};`,
  },
  test_successful_offer: {
    code: `test('offer completes successfully', async t => {
  const proposal = {
    give: { Deposit: AmountMath.make(brands.BLD, 100n) },
    want: {}
  };
  const seat = makeMockSeat(proposal);

  const result = await handler(seat);

  t.true(seat.didExit());
  t.false(seat.didFail());
  t.is(result, 'success');
});`,
  },
  test_failed_offer: {
    code: `test('offer fails with invalid input', async t => {
  const proposal = {
    give: { Deposit: AmountMath.make(brands.BLD, 0n) },  // Invalid: zero amount
    want: {}
  };
  const seat = makeMockSeat(proposal);

  await t.throwsAsync(async () => handler(seat));
  t.true(seat.didFail());
  t.regex(seat.getFailReason(), /must be positive/);
});`,
  },
  test_proposal_validation: {
    code: `test('rejects invalid proposal shape', async t => {
  const invalidProposal = {
    give: {},  // Missing required Deposit
    want: {}
  };

  // Proposal shape validation happens before handler
  t.throws(() => mustMatch(invalidProposal, proposalShape));
});`,
  },
  test_continuing_offer: {
    code: `test('continuing offer returns invitationMakers', async t => {
  const seat = makeMockSeat();

  const result = await createAccountHandler(seat);

  t.truthy(result.invitationMakers);
  t.is(typeof result.invitationMakers.makeOperationInvitation, 'function');
});`,
  },
};

export const registerTestingTools = (server: McpServer) => {
  server.tool(
    'agoric_test_setup',
    'Guide to setting up tests with AVA and SES for Agoric contracts. Returns test file boilerplate and configuration.',
    {
      testType: z
        .enum(['unit', 'integration', 'both'])
        .default('both')
        .describe('Type of test setup'),
    },
    async ({ testType }) => {
      let response: Record<string, unknown>;

      if (testType === 'unit') {
        response = {
          package_json_config: testSetupData.package_json_config,
          critical_settings: testSetupData.critical_settings,
          basic_test_file: testSetupData.basic_test_file,
          test_commands: testSetupData.test_commands,
        };
      } else if (testType === 'integration') {
        response = {
          package_json_config: testSetupData.package_json_config,
          critical_settings: testSetupData.critical_settings,
          integration_test_file: `// @ts-check
import { test } from '@agoric/zoe/tools/prepare-test-env-ava.js';
import { makeZoeKitForTest } from '@agoric/zoe/tools/setup-zoe.js';
import { E } from '@endo/far';
import { makeTracer } from '@agoric/internal';

const trace = makeTracer('IntTest');

test.before(async t => {
  const { zoe, bundleAndInstall } = await makeZoeKitForTest(t);
  t.context = { zoe, bundleAndInstall };
});

test('contract integration', async t => {
  const { zoe, bundleAndInstall } = t.context;
  // Integration test code here
  t.pass();
});`,
          test_commands: testSetupData.test_commands,
        };
      } else {
        response = testSetupData;
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
    'agoric_test_patterns',
    'Common testing patterns for Agoric contracts. Shows unit and integration test examples for various scenarios.',
    {
      patternType: z
        .enum(['unit', 'contract', 'offer', 'all'])
        .default('all')
        .describe('Specific test pattern to show'),
    },
    async ({ patternType }) => {
      let response: Record<string, unknown>;

      if (patternType === 'unit') {
        response = {
          unit_tests: testPatternsData.unit_tests,
          pattern_tests: testPatternsData.pattern_tests,
        };
      } else if (patternType === 'contract') {
        response = {
          contract_tests: testPatternsData.contract_tests,
          mock_patterns: testPatternsData.mock_patterns,
        };
      } else if (patternType === 'offer') {
        response = {
          mock_seat: testOffersData.mock_seat,
          test_successful_offer: testOffersData.test_successful_offer,
          test_failed_offer: testOffersData.test_failed_offer,
        };
      } else {
        response = testPatternsData;
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
    'agoric_mock_chain',
    'Patterns for mocking chain responses in orchestration tests. Shows mock patterns for various chain interactions.',
    {
      mockType: z
        .enum(['account', 'chain', 'orchestrator', 'all'])
        .default('all')
        .describe('Type of mock to generate'),
    },
    async ({ mockType }) => {
      let response: Record<string, unknown>;

      if (mockType === 'account') {
        response = {
          mock_account: mockChainData.mock_account,
          usage: mockChainData.usage,
        };
      } else if (mockType === 'chain') {
        response = {
          mock_account: mockChainData.mock_account,
          mock_chain: mockChainData.mock_chain,
          usage: mockChainData.usage,
        };
      } else if (mockType === 'orchestrator') {
        response = mockChainData;
      } else {
        response = mockChainData;
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
    'agoric_test_offers',
    'Patterns for testing offer flows in Zoe contracts. Shows how to simulate offers, check outcomes, and test edge cases.',
    {
      offerType: z
        .enum(['basic', 'with_payment', 'continuing', 'all'])
        .default('all')
        .describe('Type of offer flow to test'),
    },
    async ({ offerType }) => {
      let response: Record<string, unknown>;

      if (offerType === 'basic') {
        response = {
          mock_seat: testOffersData.mock_seat,
          test_successful_offer: testOffersData.test_successful_offer,
        };
      } else if (offerType === 'with_payment') {
        response = {
          mock_seat: testOffersData.mock_seat,
          test_successful_offer: testOffersData.test_successful_offer,
          test_failed_offer: testOffersData.test_failed_offer,
          test_proposal_validation: testOffersData.test_proposal_validation,
        };
      } else if (offerType === 'continuing') {
        response = {
          mock_seat: testOffersData.mock_seat,
          test_continuing_offer: testOffersData.test_continuing_offer,
        };
      } else {
        response = testOffersData;
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
