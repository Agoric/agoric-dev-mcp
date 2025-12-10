import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

const tracingSetupData = {
  import: "import { makeTracer } from '@agoric/internal';",
  basic_setup: {
    code: "const trace = makeTracer('ModuleName');",
    parameters: {
      first: 'Prefix string for all trace output',
      second: 'Optional boolean to enable/disable (default: true in debug)',
    },
  },
  usage_patterns: {
    simple: "trace('Starting operation');",
    with_values: "trace('Processing amount:', amount, 'for user:', userId);",
    with_objects: "trace('State:', JSON.stringify(this.state));",
    entry_exit:
      "trace('-> enterFunction', args);\n// ... function body ...\ntrace('<- exitFunction', result);",
  },
  recommended_prefixes: {
    contract: "'ContractName' or 'ContractName-Init'",
    flows: "'FlowName-Flows'",
    account_kit: "'AccountKit' or 'AccountKit-Holder'",
    utils: "'Utils-ModuleName'",
  },
  best_practices: [
    'Create one tracer per module with unique prefix',
    'Trace at entry and exit of important functions',
    'Include relevant values for debugging',
    'Use JSON.stringify for complex objects',
    'Disable sensitive data tracing in production',
  ],
  production_note:
    "const trace = makeTracer('Module', false);  // Disabled by default",
};

const debugPatternsData = {
  state_debugging: {
    description: 'Debug durable state issues',
    techniques: [
      'Trace state on every modification',
      'Validate state shape with mustMatch',
      'Check for non-serializable values',
    ],
    code: `// Trace state changes
const oldState = JSON.stringify(this.state);
this.state.count += 1n;
trace('State changed:', oldState, '->', JSON.stringify(this.state));`,
  },
  async_debugging: {
    description: 'Debug async/vow issues',
    techniques: [
      'Trace before and after every await',
      'Check if operations complete',
      'Verify vow resolution',
    ],
    code: `trace('Starting async operation');
try {
  const result = await operation();
  trace('Operation completed:', result);
} catch (e) {
  trace('Operation failed:', e.message);
  throw e;
}`,
  },
  pattern_debugging: {
    description: 'Debug pattern matching failures',
    techniques: [
      'Test patterns in isolation',
      'Log the actual value before mustMatch',
      'Use try/catch to capture error details',
    ],
    code: `trace('Validating value:', JSON.stringify(value));
try {
  mustMatch(value, MyPattern);
  trace('Validation passed');
} catch (e) {
  trace('Validation failed:', e.message);
  throw e;
}`,
  },
  seat_debugging: {
    description: 'Debug seat lifecycle issues',
    techniques: [
      'Always log seat state before operations',
      'Track exit/fail calls',
      'Verify proposal extraction',
    ],
    code: `trace('Seat hasExited:', seat.hasExited());
const proposal = seat.getProposal();
trace('Proposal:', JSON.stringify(proposal));`,
  },
  ibc_debugging: {
    description: 'Debug IBC transfer issues',
    techniques: [
      'Log full memo content',
      'Verify destination address format',
      'Check denom transformations',
    ],
    code: `trace('IBC Transfer:', {
  destination: destination.value,
  chainId: destination.chainId,
  amount: amount.value.toString(),
  denom: amount.denom,
  memo: memo
});`,
  },
  orchestration_debugging: {
    description: 'Debug orchestration flow issues',
    techniques: [
      'Trace at each chain interaction',
      'Log account addresses',
      'Track transfer status',
    ],
    code: `trace('Getting chain:', chainName);
const chain = await orch.getChain(chainName);
trace('Chain retrieved, creating account');
const account = await chain.makeAccount();
trace('Account created:', await account.getAddress());`,
  },
};

const commonErrorsData = {
  hardening_errors: {
    not_hardened: {
      error: 'Cannot pass non-frozen objects',
      cause: 'Trying to pass unhardened object across trust boundary',
      fix: 'Call harden() on the object before passing/returning',
    },
    mutating_frozen: {
      error: 'Cannot assign to read only property',
      cause: 'Attempting to modify a hardened object',
      fix: 'Create a new object instead of modifying',
    },
  },
  pattern_errors: {
    match_failed: {
      error: 'value ... - Must match pattern ...',
      cause: "Value doesn't match expected pattern",
      fix: 'Check value structure against pattern, ensure all required fields present',
    },
    invalid_interface: {
      error: 'Method ... not in interface',
      cause: 'Calling method not defined in interface guard',
      fix: 'Add method to interface definition or check method name',
    },
    wrong_arity: {
      error: 'Expected ... arguments, got ...',
      cause: 'Method called with wrong number of arguments',
      fix: 'Check interface guard definition matches method signature',
    },
  },
  seat_errors: {
    already_exited: {
      error: 'seat has already exited',
      cause: 'Operating on seat after exit() or fail()',
      fix: 'Check seat.hasExited() before operations',
    },
    proposal_mismatch: {
      error: "proposal ... doesn't match proposalShape",
      cause: "User's proposal doesn't match required shape",
      fix: "Verify proposal shape definition, check user's offer",
    },
    no_allocation: {
      error: 'keyword ... not in allocation',
      cause: 'Accessing allocation keyword that was not in proposal',
      fix: 'Check proposal give/want keywords match expected',
    },
  },
  vow_errors: {
    promise_in_state: {
      error: 'Cannot serialize Promise',
      cause: 'Storing Promise in durable state',
      fix: 'Use Vows instead of Promises in durable contexts',
    },
    watcher_not_durable: {
      error: 'watcher must be a durable object',
      cause: 'Using non-exo object as vow watcher',
      fix: 'Define watcher as facet in exoClassKit',
    },
  },
  state_errors: {
    non_serializable: {
      error: 'Cannot serialize ...',
      cause: 'Storing function, class instance, or other non-serializable value',
      fix: 'Store only primitives, plain objects, arrays, or remotables',
    },
    zone_name_collision: {
      error: 'key ... already used in zone',
      cause: 'Creating exo/exoClass with duplicate name in same zone',
      fix: 'Use unique names or subZones for namespacing',
    },
  },
  orchestration_errors: {
    chain_not_found: {
      error: 'chain ... not registered',
      cause: 'Attempting to use unregistered chain',
      fix: 'Ensure chain is in chainInfo and properly registered',
    },
    no_connection: {
      error: 'no connection to ...',
      cause: 'IBC connection info missing between chains',
      fix: 'Verify connectionInfo includes transfer channel',
    },
    invalid_address: {
      error: 'invalid bech32 address',
      cause: 'Address format incorrect for target chain',
      fix: 'Verify address prefix matches chain (osmo1, agoric1, etc.)',
    },
  },
};

export const registerDebuggingTools = (server: McpServer) => {
  server.tool(
    'agoric_tracing_setup',
    'Guide to setting up makeTracer for contract debugging. Covers tracer patterns, log levels, and best practices.',
    {
      includePatterns: z
        .boolean()
        .default(true)
        .describe('Include common tracing patterns'),
    },
    async ({ includePatterns }) => {
      let response: Record<string, unknown>;

      if (includePatterns) {
        response = tracingSetupData;
      } else {
        response = {
          import: tracingSetupData.import,
          basic_setup: tracingSetupData.basic_setup,
          recommended_prefixes: tracingSetupData.recommended_prefixes,
          best_practices: tracingSetupData.best_practices,
          production_note: tracingSetupData.production_note,
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
    'agoric_debug_patterns',
    'Common debugging approaches for Agoric contracts. Covers techniques for finding and fixing issues.',
    {
      issueType: z
        .enum(['state', 'async', 'patterns', 'seats', 'ibc', 'orchestration', 'all'])
        .default('all')
        .describe('Specific debugging topic'),
    },
    async ({ issueType }) => {
      let response: Record<string, unknown>;

      if (issueType === 'all') {
        response = debugPatternsData;
      } else if (issueType === 'state') {
        response = {
          state_debugging: debugPatternsData.state_debugging,
        };
      } else if (issueType === 'async') {
        response = {
          async_debugging: debugPatternsData.async_debugging,
        };
      } else if (issueType === 'patterns') {
        response = {
          pattern_debugging: debugPatternsData.pattern_debugging,
        };
      } else if (issueType === 'seats') {
        response = {
          seat_debugging: debugPatternsData.seat_debugging,
        };
      } else if (issueType === 'ibc') {
        response = {
          ibc_debugging: debugPatternsData.ibc_debugging,
        };
      } else if (issueType === 'orchestration') {
        response = {
          orchestration_debugging: debugPatternsData.orchestration_debugging,
        };
      } else {
        response = debugPatternsData;
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
    'agoric_common_errors',
    'Reference for common Agoric errors and their solutions. Searchable by error message or category.',
    {
      errorCategory: z
        .enum([
          'hardening',
          'patterns',
          'seats',
          'vows',
          'state',
          'orchestration',
          'all',
        ])
        .default('all')
        .describe('Category of errors to show'),
      searchTerm: z
        .string()
        .optional()
        .describe('Search for specific error message'),
    },
    async ({ errorCategory, searchTerm }) => {
      let response: Record<string, unknown>;

      const categoryMapping: Record<string, keyof typeof commonErrorsData> = {
        hardening: 'hardening_errors',
        patterns: 'pattern_errors',
        seats: 'seat_errors',
        vows: 'vow_errors',
        state: 'state_errors',
        orchestration: 'orchestration_errors',
      };

      if (searchTerm) {
        // Search all errors for the term
        const searchResults: Record<string, unknown> = {};
        const searchLower = searchTerm.toLowerCase();

        for (const [categoryKey, errors] of Object.entries(commonErrorsData)) {
          for (const [errorKey, errorData] of Object.entries(errors)) {
            const errorObj = errorData as { error: string; cause: string; fix: string };
            if (
              errorObj.error.toLowerCase().includes(searchLower) ||
              errorObj.cause.toLowerCase().includes(searchLower) ||
              errorObj.fix.toLowerCase().includes(searchLower)
            ) {
              if (!searchResults[categoryKey]) {
                searchResults[categoryKey] = {};
              }
              (searchResults[categoryKey] as Record<string, unknown>)[errorKey] = errorObj;
            }
          }
        }

        response = {
          search_term: searchTerm,
          results: searchResults,
          total_matches: Object.values(searchResults).reduce(
            (acc: number, cat) => acc + Object.keys(cat as Record<string, unknown>).length,
            0,
          ),
        };
      } else if (errorCategory === 'all') {
        response = commonErrorsData;
      } else {
        const key = categoryMapping[errorCategory];
        response = {
          [key]: commonErrorsData[key],
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
