import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

const zonesGuideData = {
  overview:
    'Zones provide namespaced, durable storage that survives contract upgrades',
  receiving_zone:
    'In orchestration contracts, zone is passed as third parameter:\n\nexport const contract = async (zcf, privateArgs, zone, tools) => { ... }',
  methods: {
    'zone.exo': {
      description: 'Create a singleton durable object',
      signature: 'zone.exo(name, interfaceGuard, methods)',
      use_case: 'Single instances like public/creator facets',
      example: `const publicFacet = zone.exo(
  'PublicFacet',
  M.interface('PublicFacet', {
    getStatus: M.call().returns(M.string())
  }),
  {
    getStatus() { return 'active'; }
  }
);`,
    },
    'zone.exoClass': {
      description:
        'Create a factory for durable objects with individual state',
      signature: 'zone.exoClass(name, interfaceGuard, init, methods)',
      use_case: 'Multiple instances with shared behavior, separate state',
      example: `const makeCounter = zone.exoClass(
  'Counter',
  M.interface('Counter', {
    increment: M.call().returns(M.bigint()),
    getValue: M.call().returns(M.bigint())
  }),
  () => ({ count: 0n }),
  {
    increment() {
      this.state.count += 1n;
      return this.state.count;
    },
    getValue() {
      return this.state.count;
    }
  }
);`,
    },
    'zone.exoClassKit': {
      description: 'Create multiple related facets sharing state',
      signature: 'zone.exoClassKit(name, interfaceGuards, init, facets)',
      use_case: 'Complex objects with multiple interfaces (account kits)',
      example: 'See agoric_account_kit_template',
    },
    'zone.subZone': {
      description: 'Create a child zone for namespacing',
      signature: 'zone.subZone(name)',
      use_case: 'Organize complex state, prevent name collisions',
      example: `const accountsZone = zone.subZone('accounts');
const makeAccountKit = prepareAccountKit(accountsZone, powers);`,
    },
  },
  state_access: {
    in_exoClass: 'this.state.fieldName',
    in_exoClassKit: 'this.state.fieldName (shared across facets)',
    facet_access: 'this.facets.otherFacetName.method()',
  },
};

const exoPatternsData = {
  comparison: {
    exo: {
      instances: 'Singleton - one instance per zone',
      state: 'No instance state (can use closure variables)',
      use_when: 'Contract facets, services, single objects',
      example_use_cases: ['Public facet', 'Creator facet', 'Singleton services'],
    },
    exoClass: {
      instances: 'Multiple - factory returns new instances',
      state: 'Each instance has own state via this.state',
      use_when: 'Need multiple objects with same interface, different state',
      example_use_cases: ['User accounts', 'Order objects', 'Game characters'],
    },
    exoClassKit: {
      instances: 'Multiple - factory returns kit with multiple facets',
      state: 'Shared state across all facets in a kit',
      use_when: 'Need multiple interfaces on same underlying state',
      example_use_cases: [
        'Account kits (holder, invitationMakers, tap)',
        'Complex entities with admin/user views',
      ],
    },
  },
  decision_tree: [
    'Do you need multiple instances? No → exo',
    'Do you need multiple instances? Yes →',
    '  Do instances need multiple facets? No → exoClass',
    '  Do instances need multiple facets? Yes → exoClassKit',
  ],
  interface_guards: {
    purpose: 'Define allowed methods and their signatures',
    format:
      'M.interface(name, { methodName: M.call(...argPatterns).returns(returnPattern) })',
    async_methods: 'Use M.callWhen() for async methods',
  },
  examples: {
    exo: `const publicFacet = zone.exo(
  'PublicFacet',
  M.interface('PublicFacet', {
    getStatus: M.call().returns(M.string()),
    makeInvitation: M.callWhen().returns(M.any())
  }),
  {
    getStatus() { return 'active'; },
    makeInvitation() { return zcf.makeInvitation(...); }
  }
);`,
    exoClass: `const makeAccount = zone.exoClass(
  'Account',
  M.interface('Account', {
    getBalance: M.call().returns(M.bigint()),
    deposit: M.call(M.bigint()).returns(M.bigint())
  }),
  (initialBalance) => ({ balance: initialBalance }),
  {
    getBalance() { return this.state.balance; },
    deposit(amount) {
      this.state.balance += amount;
      return this.state.balance;
    }
  }
);

const account1 = makeAccount(100n);
const account2 = makeAccount(200n);`,
    exoClassKit: `const makeAccountKit = zone.exoClassKit(
  'AccountKit',
  {
    holder: HolderI,
    admin: AdminI
  },
  (initialState) => ({ ...initialState }),
  {
    holder: {
      getBalance() { return this.state.balance; }
    },
    admin: {
      setBalance(newBalance) {
        this.state.balance = newBalance;
      }
    }
  }
);`,
  },
};

const vowsGuideData = {
  why_vows: {
    problem: "Promises are ephemeral - they don't survive contract upgrades",
    solution: 'Vows provide Promise-like semantics with durability',
    key_difference: 'Vows can be stored in durable state, Promises cannot',
  },
  vow_tools: {
    source:
      'Received from orchestration tools or create with prepareVowTools(zone)',
    methods: {
      when: {
        signature: 'vowTools.when(vow, onFulfilled?, onRejected?)',
        description: 'Like Promise.then() but works with vows',
        example: `return vowTools.when(vow, result => {
  trace('Got result:', result);
  return result;
});`,
      },
      all: {
        signature: 'vowTools.all(vowArray)',
        description: 'Like Promise.all() for vows',
        example:
          'const [a, b, c] = await vowTools.all([vowA, vowB, vowC]);',
      },
      watch: {
        signature: 'vowTools.watch(promise, watcher, context?)',
        description: 'Convert promise to vow with durable watcher',
        example: `return vowTools.watch(
  someAsyncOperation(),
  this.facets.transferWatcher,
  { amount: 100n }
);`,
      },
    },
  },
  watcher_pattern: {
    description: 'Durable watchers handle vow resolution across upgrades',
    definition: `// In exoClassKit facets
transferWatcher: {
  onFulfilled(result, context) {
    trace('Success:', result, 'Context:', context);
    // Handle success
  },
  onRejected(error, context) {
    trace('Failed:', error, 'Context:', context);
    // Handle failure
  }
}`,
    interface: `const WatcherI = M.interface('Watcher', {
  onFulfilled: M.call(M.any()).optional(M.any()).returns(M.any()),
  onRejected: M.call(M.any()).optional(M.any()).returns(M.any())
});`,
    notes: [
      'Watchers must be durable (defined in exoClassKit)',
      'Context is stored and passed to watcher methods',
      'Keep watcher logic simple',
    ],
  },
  vow_shape: {
    import: "import { VowShape } from '@agoric/vow';",
    usage: 'Use in interface guards for methods returning vows',
    example: `M.interface('MyInterface', {
  asyncMethod: M.call(M.any()).returns(VowShape)
})`,
  },
  best_practices: [
    'Never store Promises in durable state',
    'Use vowTools.when() instead of .then()',
    'Use watchers for complex async chains',
    'Pass context through watcher for state needed after resolution',
  ],
};

const stateConstraintsData = {
  overview: 'Durable state must be serializable across contract upgrades',
  allowed: {
    primitives: [
      'string',
      'number',
      'bigint',
      'boolean',
      'null',
      'undefined',
    ],
    collections: [
      'Plain objects (records)',
      'Arrays',
      'Maps (converted)',
      'Sets (converted)',
    ],
    special: [
      'Remotables (Far objects) - references to other durable objects',
      'Amounts - { brand, value }',
      'Hardened objects',
    ],
  },
  not_allowed: {
    functions: {
      reason: 'Functions cannot be serialized',
      workaround: 'Store data, define methods in exo definition',
    },
    promises: {
      reason: 'Promises are ephemeral, lose resolution on upgrade',
      workaround: 'Use Vows instead',
    },
    weak_collections: {
      reason: 'WeakMap/WeakSet cannot be serialized',
      workaround: 'Use regular Map/Set or restructure',
    },
    closures: {
      reason: 'Closures capture non-serializable scope',
      workaround: 'Store captured values explicitly in state',
    },
    class_instances: {
      reason: 'Class prototype chain not preserved',
      workaround: 'Use plain objects or exo patterns',
    },
  },
  validation_pattern: {
    description: 'Validate state shape on initialization',
    code: `zone.exoClassKit(
  'MyKit',
  interfaceGuards,
  (initialState) => {
    mustMatch(initialState, StateShape);
    return harden({ ...initialState });
  },
  facets
);`,
  },
  tips: [
    'Keep state minimal - derive computed values when needed',
    'Document state shape with JSDoc',
    'Initialize all state fields in init function',
    'Use subZones to organize complex state',
  ],
};

export const registerDurabilityTools = (server: McpServer) => {
  server.tool(
    'agoric_zones_guide',
    'Guide to using zones for durable state in Agoric contracts. Covers zone methods, state constraints, and durability requirements.',
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
          overview: zonesGuideData.overview,
          receiving_zone: zonesGuideData.receiving_zone,
          methods: {
            'zone.exo': {
              description: zonesGuideData.methods['zone.exo'].description,
              use_case: zonesGuideData.methods['zone.exo'].use_case,
            },
            'zone.exoClass': {
              description: zonesGuideData.methods['zone.exoClass'].description,
              use_case: zonesGuideData.methods['zone.exoClass'].use_case,
            },
            'zone.exoClassKit': {
              description: zonesGuideData.methods['zone.exoClassKit'].description,
              use_case: zonesGuideData.methods['zone.exoClassKit'].use_case,
            },
            'zone.subZone': {
              description: zonesGuideData.methods['zone.subZone'].description,
              use_case: zonesGuideData.methods['zone.subZone'].use_case,
            },
          },
        };
      } else {
        response = zonesGuideData;
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
    'agoric_exo_patterns',
    'Guide to exo, exoClass, and exoClassKit usage. Explains when to use each pattern with examples.',
    {
      includeExamples: z
        .boolean()
        .default(true)
        .describe('Include code examples'),
    },
    async ({ includeExamples }) => {
      let response: Record<string, unknown>;

      if (includeExamples) {
        response = exoPatternsData;
      } else {
        response = {
          comparison: exoPatternsData.comparison,
          decision_tree: exoPatternsData.decision_tree,
          interface_guards: exoPatternsData.interface_guards,
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
    'agoric_vows_guide',
    'Guide to Vows vs Promises in durable objects. Covers VowTools API, watcher patterns, and when to use each.',
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
          why_vows: vowsGuideData.why_vows,
          vow_tools: {
            source: vowsGuideData.vow_tools.source,
            methods: Object.fromEntries(
              Object.entries(vowsGuideData.vow_tools.methods).map(
                ([key, value]) => [key, { signature: value.signature, description: value.description }],
              ),
            ),
          },
          best_practices: vowsGuideData.best_practices,
        };
      } else {
        response = vowsGuideData;
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
    'agoric_state_constraints',
    'Guide to what can and cannot be stored in durable state. Covers rules, common mistakes, and workarounds.',
    {},
    async () => {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(stateConstraintsData, null, 2),
          },
        ],
      };
    },
  );
};
