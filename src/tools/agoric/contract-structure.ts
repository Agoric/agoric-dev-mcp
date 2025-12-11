import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

const contractTemplateCode = `/**
 * @file Contract entry point
 */

import { M } from '@endo/patterns';
import { withOrchestration } from '@agoric/orchestration/src/utils/start-helper.js';
import { registerChainsAndAssets } from '@agoric/orchestration/src/utils/chain-hub-helper.js';
import { prepareChainHubAdmin } from '@agoric/orchestration/src/exos/chain-hub-admin.js';
import { makeTracer } from '@agoric/internal';
import { makeError } from '@endo/errors';

import * as flows from './flows.js';
import { prepareAccountKit } from './account-kit.js';
import { PrivateArgsShape } from './utils/type-guards.js';

const trace = makeTracer('{{CONTRACT_NAME}}');

/** @type {ContractMeta} */
export const meta = {
  privateArgsShape: PrivateArgsShape,
};
harden(meta);

export const contract = async (
  zcf,
  privateArgs,
  zone,
  { chainHub, orchestrateAll, zoeTools, vowTools },
) => {
  trace('Contract starting');

  const { brands } = zcf.getTerms();
  const { chainInfo, assetInfo } = privateArgs;

  // Register chains and assets
  registerChainsAndAssets(chainHub, brands, chainInfo, assetInfo);

  // Create chain hub admin for dynamic registration
  const chainHubAdminFacet = prepareChainHubAdmin(zone, chainHub);

  // Prepare account kit maker
  const makeAccountKit = prepareAccountKit(zone.subZone('accounts'), {
    zcf,
    vowTools,
    zoeTools,
  });

  // Set up orchestration flows
  const { createAccount } = orchestrateAll(
    { createAccount: flows.createAccount },
    { makeAccountKit }
  );

  // Public facet
  const publicFacet = zone.exo(
    'PublicFacet',
    M.interface('PublicFacet', {
      makeAccountInvitation: M.callWhen().returns(M.any()),
    }),
    {
      makeAccountInvitation() {
        return zcf.makeInvitation(createAccount, 'createAccount');
      },
    },
  );

  // Creator facet
  const creatorFacet = zone.exo(
    'CreatorFacet',
    M.interface('CreatorFacet', {
      registerChain: M.call(M.string(), M.record(), M.any()).returns(M.promise()),
      registerAsset: M.call(M.string(), M.record()).returns(M.promise()),
    }),
    {
      registerChain(chainName, chainInfo, connectionInfo) {
        return chainHubAdminFacet.registerChain(chainName, chainInfo, connectionInfo);
      },
      registerAsset(denom, detail) {
        return chainHubAdminFacet.registerAsset(denom, detail);
      },
    },
  );

  return harden({ publicFacet, creatorFacet });
};
harden(contract);

export const start = withOrchestration(contract);
harden(start);`;

const contractTemplateWithoutOrchestration = `/**
 * @file Contract entry point
 */

import { M } from '@endo/patterns';
import { makeTracer } from '@agoric/internal';
import { makeError } from '@endo/errors';

const trace = makeTracer('{{CONTRACT_NAME}}');

/**
 * @param {ZCF} zcf
 */
export const start = async (zcf) => {
  trace('Contract starting');

  const { brands } = zcf.getTerms();

  // Public facet
  const publicFacet = Far('PublicFacet', {
    getStatus() {
      return 'active';
    },
  });

  // Creator facet
  const creatorFacet = Far('CreatorFacet', {
    // Administrative methods here
  });

  return harden({ publicFacet, creatorFacet });
};
harden(start);`;

const flowTemplateCode = `/**
 * @file Orchestration flows
 */

import { makeTracer } from '@agoric/internal';

/**
 * @import {Orchestrator, OrchestrationFlow} from '@agoric/orchestration';
 * @import {MakeAccountKit} from './account-kit.js';
 * @import {ZCFSeat} from '@agoric/zoe';
 */

const trace = makeTracer('Flows');

/**
 * @satisfies {OrchestrationFlow}
 * @param {Orchestrator} orch
 * @param {{ makeAccountKit: MakeAccountKit }} ctx
 * @param {ZCFSeat} seat
 */
export const {{FLOW_NAME}} = async (
  orch,
  { makeAccountKit },
  seat,
) => {
  trace('Creating account');

  const chain = await orch.getChain('{{CHAIN}}');
  const localAccount = await chain.makeAccount();
  const address = await localAccount.getAddress();
  const chainId = (await chain.getChainInfo()).chainId;
  const assets = await chain.getVBankAssetInfo();

  trace('Account created:', address);

  const accountKit = makeAccountKit({
    localAccount,
    localChainAddress: address,
    localChainId: chainId,
    assets,
  });

  {{MONITOR_TRANSFERS}}

  seat.exit();

  return harden({ invitationMakers: accountKit.invitationMakers });
};
harden({{FLOW_NAME}});`;

const accountKitTemplateCode = `/**
 * @file Durable account kit
 */

import { M, mustMatch } from '@endo/patterns';
import { VowShape } from '@agoric/vow';
import { makeTracer } from '@agoric/internal';
import { Fail, makeError, q } from '@endo/errors';
import { AmountMath } from '@agoric/ertp';

/**
 * @import {VowTools} from '@agoric/vow';
 * @import {Zone} from '@agoric/zone';
 * @import {ZoeTools} from '@agoric/orchestration/src/utils/zoe-tools.js';
 * @import {ZCF, ZCFSeat} from '@agoric/zoe';
 * @import {VTransferIBCEvent} from '@agoric/vats';
 */

const trace = makeTracer('AccountKit');

const HolderI = M.interface('Holder', {
  getAddress: M.call().returns(M.any()),
  send: M.call(M.any(), M.any()).returns(M.any()),
  fundAccount: M.call(M.any(), M.any()).returns(VowShape),
});

const InvitationMakersI = M.interface('InvitationMakers', {
  makeOperationInvitation: M.call(M.string(), M.array()).returns(M.any()),
});

const TapI = M.interface('Tap', {
  receiveUpcall: M.call(M.record()).returns(M.or(VowShape, M.undefined())),
});

const WatcherI = M.interface('TransferWatcher', {
  onFulfilled: M.call(M.undefined()).optional(M.bigint()).returns(VowShape),
});

/**
 * @param {Zone} zone
 * @param {{
 *   zcf: ZCF;
 *   vowTools: VowTools;
 *   zoeTools: ZoeTools;
 * }} powers
 */
export const prepareAccountKit = (zone, { zcf, vowTools, zoeTools }) => {
  return zone.exoClassKit(
    '{{KIT_NAME}}',
    {
      holder: HolderI,
      invitationMakers: InvitationMakersI,
      {{TAP_FACET}}
      {{WATCHER_FACET}}
    },
    /**
     * @param {object} initialState
     */
    initialState => {
      // Validate initial state here
      return harden({ ...initialState });
    },
    {
      holder: {
        getAddress() {
          return this.state.localChainAddress;
        },

        async send(toAccount, amount) {
          await this.state.localAccount.send(toAccount, amount);
          return 'transfer success';
        },

        fundAccount(seat, give) {
          seat.hasExited() && Fail\`Seat has already exited\`;
          return zoeTools.localTransfer(seat, this.state.localAccount, give);
        },
      },

      invitationMakers: {
        makeOperationInvitation(method, args) {
          const handler = async (seat) => {
            const { holder } = this.facets;

            switch (method) {
              case 'getAddress': {
                const result = holder.getAddress();
                seat.exit();
                return result;
              }
              case 'send': {
                const result = await holder.send(args[0], args[1]);
                seat.exit();
                return result;
              }
              default:
                throw makeError(\`Unknown method: \${q(method)}\`);
            }
          };

          return zcf.makeInvitation(handler, 'operation');
        },
      },

      {{TAP_IMPL}}
      {{WATCHER_IMPL}}
    },
  );
};

/** @typedef {ReturnType<typeof prepareAccountKit>} MakeAccountKit */
/** @typedef {ReturnType<MakeAccountKit>} AccountKit */`;

const facetDesignData = {
  public_facet: {
    purpose: 'Accessible to anyone with the contract instance reference',
    guidelines: [
      'Return invitations, not direct capabilities',
      'Expose only read-only queries that are safe for anyone',
      'Keep method count minimal',
      'Use clear, descriptive method names',
      'Always define interface guards',
    ],
    common_methods: [
      'makeInvitation() - Create participation invitations',
      'getStatus() - Query contract state',
      'getTerms() - Return contract terms',
    ],
    example: `const publicFacet = zone.exo(
  'PublicFacet',
  M.interface('PublicFacet', {
    makeSwapInvitation: M.callWhen().returns(M.any()),
    getPoolBalance: M.call().returns(M.any()),
  }),
  {
    makeSwapInvitation() {
      return zcf.makeInvitation(swapHandler, 'swap');
    },
    getPoolBalance() {
      return currentBalance;
    },
  },
);`,
  },
  creator_facet: {
    purpose:
      'Returned only to contract deployer for administrative operations',
    guidelines: [
      'Administrative operations only',
      'Should not bypass security checks',
      'Use for registration and configuration',
      'Log administrative actions',
      'Can provide emergency controls',
    ],
    common_methods: [
      'registerChain() - Add new chain support',
      'registerAsset() - Add new asset support',
      'setOfferFilter() - Restrict allowed offers',
      'pause() / unpause() - Emergency controls',
    ],
    example: `const creatorFacet = zone.exo(
  'CreatorFacet',
  M.interface('CreatorFacet', {
    setOfferFilter: M.call(M.arrayOf(M.string())).returns(M.promise()),
    registerChain: M.call(M.string(), M.record(), M.any()).returns(M.promise()),
  }),
  {
    setOfferFilter(strings) {
      return zcf.setOfferFilter(strings);
    },
    registerChain(name, info, connection) {
      return chainHubAdmin.registerChain(name, info, connection);
    },
  },
);`,
  },
  internal_communication: {
    description: 'How facets within an exoClassKit communicate',
    patterns: [
      'this.facets.otherFacet.method() - Call sibling facet',
      'this.state.sharedValue - Access shared state',
      'Each facet can have its own interface guard',
    ],
  },
};

export const registerContractStructureTools = (server: McpServer) => {
  server.tool(
    'agoric_contract_template',
    'Generate a basic contract entry point structure. Returns template code for contract.js with proper exports and setup.',
    {
      contractName: z.string().describe('Name of the contract'),
      withOrchestration: z
        .boolean()
        .default(true)
        .describe('Include orchestration wrapper'),
      withCreatorFacet: z
        .boolean()
        .default(true)
        .describe('Include creator facet'),
      chainSupport: z
        .array(z.enum(['cosmos', 'evm']))
        .optional()
        .describe('Chains to support'),
    },
    async ({ contractName, withOrchestration, withCreatorFacet, chainSupport }) => {
      let code: string;

      if (withOrchestration) {
        code = contractTemplateCode.replace(/\{\{CONTRACT_NAME\}\}/g, contractName);
      } else {
        code = contractTemplateWithoutOrchestration.replace(
          /\{\{CONTRACT_NAME\}\}/g,
          contractName,
        );
      }

      if (!withCreatorFacet) {
        // Remove creator facet from the code
        code = code.replace(
          /\/\/ Creator facet[\s\S]*?return harden\(\{ publicFacet, creatorFacet \}\);/,
          'return harden({ publicFacet });',
        );
      }

      const requiredImports = ['@endo/patterns', '@endo/errors', '@agoric/internal'];
      if (withOrchestration) {
        requiredImports.push('@agoric/orchestration');
      }

      const companionFiles = ['utils/type-guards.js'];
      if (withOrchestration) {
        companionFiles.unshift('flows.js', 'account-kit.js');
      }

      const response = {
        code,
        file_path: 'src/contract.js',
        required_imports: requiredImports,
        companion_files: companionFiles,
        chain_support: chainSupport || ['cosmos'],
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
    'agoric_flow_template',
    'Generate orchestration flow structure. Returns template code for flows.js with proper async flow patterns.',
    {
      flowName: z.string().describe('Name of the flow function'),
      createsAccount: z
        .boolean()
        .default(true)
        .describe('Whether flow creates an account'),
      monitorsTransfers: z
        .boolean()
        .default(true)
        .describe('Whether to set up transfer monitoring'),
      chain: z.string().default('agoric').describe('Target chain name'),
    },
    async ({ flowName, createsAccount, monitorsTransfers, chain }) => {
      let code = flowTemplateCode
        .replace(/\{\{FLOW_NAME\}\}/g, flowName)
        .replace(/\{\{CHAIN\}\}/g, chain);

      if (monitorsTransfers) {
        code = code.replace(
          '{{MONITOR_TRANSFERS}}',
          `// Set up transfer monitoring
  await localAccount.monitorTransfers(accountKit.tap);

  trace('Transfer monitoring established');`,
        );
      } else {
        code = code.replace('{{MONITOR_TRANSFERS}}', '');
      }

      const response = {
        code,
        file_path: 'src/flows.js',
        context_requirements: {
          makeAccountKit: 'Factory function from prepareAccountKit',
        },
        registration_example: `const { ${flowName} } = orchestrateAll(
  { ${flowName}: flows.${flowName} },
  { makeAccountKit }
);`,
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
    'agoric_account_kit_template',
    'Generate ExoClassKit structure for account management. Returns template with standard facets (holder, invitationMakers, etc.).',
    {
      kitName: z.string().default('AccountKit').describe('Name for the kit'),
      includeTap: z
        .boolean()
        .default(true)
        .describe('Include tap facet for transfer monitoring'),
      includeWatcher: z
        .boolean()
        .default(true)
        .describe('Include transfer watcher facet'),
    },
    async ({ kitName, includeTap, includeWatcher }) => {
      let code = accountKitTemplateCode.replace(/\{\{KIT_NAME\}\}/g, kitName);

      if (includeTap) {
        code = code.replace('{{TAP_FACET}}', 'tap: TapI,');
        code = code.replace(
          '{{TAP_IMPL}}',
          `tap: {
        receiveUpcall(event) {
          trace('Received transfer event:', event);
          return undefined;
        },
      },`,
        );
      } else {
        code = code.replace('{{TAP_FACET}}', '');
        code = code.replace('{{TAP_IMPL}}', '');
      }

      if (includeWatcher) {
        code = code.replace('{{WATCHER_FACET}}', 'transferWatcher: WatcherI,');
        code = code.replace(
          '{{WATCHER_IMPL}}',
          `transferWatcher: {
        onFulfilled(_result, _value) {
          trace('Transfer completed');
        },
      },`,
        );
      } else {
        code = code.replace('{{WATCHER_FACET}}', '');
        code = code.replace('{{WATCHER_IMPL}}', '');
      }

      const facets: Record<string, string> = {
        holder: 'Core account operations - address retrieval, sending, funding',
        invitationMakers:
          'Creates Zoe invitations that route to holder methods',
      };
      if (includeTap) {
        facets.tap =
          'Receives notifications when transfers arrive at the account';
      }
      if (includeWatcher) {
        facets.transferWatcher =
          'Watches for async transfer completion (vow watcher)';
      }

      const response = {
        code,
        file_path: 'src/account-kit.js',
        facets_explained: facets,
        state_requirements:
          'State must be serializable - no functions, no Promises, no WeakMaps',
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
    'agoric_facet_design',
    'Guidelines for designing public and creator facets. Explains interface patterns, method organization, and access control.',
    {
      facetType: z
        .enum(['public', 'creator', 'both'])
        .default('both')
        .describe('Which facet type to explain'),
    },
    async ({ facetType }) => {
      let response: Record<string, unknown>;

      if (facetType === 'public') {
        response = {
          public_facet: facetDesignData.public_facet,
          internal_communication: facetDesignData.internal_communication,
        };
      } else if (facetType === 'creator') {
        response = {
          creator_facet: facetDesignData.creator_facet,
          internal_communication: facetDesignData.internal_communication,
        };
      } else {
        response = facetDesignData;
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
    'agoric_golden_contract',
    'Get the golden reference implementation of a production-grade Agoric contract. Based on fast-usdc, this shows real patterns for orchestration, flows, zone management, and facet design. Use this as the primary reference when building new contracts.',
    {
      component: z
        .enum(['contract', 'flows', 'both'])
        .default('both')
        .describe('Which component to retrieve'),
    },
    async ({ component }) => {
      const goldenContract = `// --- fast-usdc.contract.ts (Golden Reference Implementation)
// This is a production-grade contract showing best practices for:
// - Contract metadata and type guards
// - Zone-based durable state management
// - Orchestration integration with withOrchestration
// - Creator and public facet design
// - Chain and asset registration

import { AssetKind, type Amount } from '@agoric/ertp';
import {
  CosmosChainInfoShapeV1,
  FastUSDCTermsShape,
  FeeConfigShape,
} from '@agoric/fast-usdc/src/type-guards.js';
import { makeTracer } from '@agoric/internal';
import { observeIteration, subscribeEach } from '@agoric/notifier';
import {
  DenomDetailShape,
  DenomShape,
  OrchestrationPowersShape,
  registerChainsAndAssets,
  withOrchestration,
  type AmountArg,
  type Bech32Address,
  type ChainInfo,
  type CosmosChainAddress,
  type Denom,
  type DenomAmount,
  type DenomDetail,
  type IBCConnectionInfo,
  type OrchestrationAccount,
  type OrchestrationPowers,
  type OrchestrationTools,
} from '@agoric/orchestration';
import type { HostForGuest } from '@agoric/orchestration/src/facade.js';
import { makeZoeTools } from '@agoric/orchestration/src/utils/zoe-tools.js';
import { provideSingleton } from '@agoric/zoe/src/contractSupport/durability.js';
import { prepareRecorderKitMakers } from '@agoric/zoe/src/contractSupport/recorder.js';
import { Fail, quote } from '@endo/errors';
import { E } from '@endo/far';
import { M } from '@endo/patterns';

import type { HostInterface } from '@agoric/async-flow';
import type {
  ChainHubChainInfo,
  ContractRecord,
  FastUsdcTerms,
  FeeConfig,
} from '@agoric/fast-usdc/src/types.js';
import type { ERemote, Remote } from '@agoric/internal';
import type {
  Marshaller,
  StorageNode,
} from '@agoric/internal/src/lib-chainStorage.js';
import { type EMarshaller } from '@agoric/internal/src/marshal/wrap-marshaller.js';
import type { ContractMeta, Invitation, ZCF } from '@agoric/zoe';
import type { Zone } from '@agoric/zone';
import { prepareAdvancer } from './exos/advancer.ts';
import { prepareLiquidityPoolKit } from './exos/liquidity-pool.ts';
import { prepareSettler } from './exos/settler.ts';
import { prepareStatusManager } from './exos/status-manager.ts';
import type { OperatorOfferResult } from './exos/transaction-feed.ts';
import { prepareTransactionFeedKit } from './exos/transaction-feed.ts';
import * as flows from './fast-usdc.flows.ts';
import { makeSupportsCctp } from './utils/cctp.ts';
import { startForwardRetrier } from './utils/forward-retrier.ts';
import { makeRouteHealth } from './utils/route-health.ts';

const trace = makeTracer('FastUsdc');

// With a 10 minute timeout this means retry for up to an hour.
const MAX_ROUTE_FAILURES = 6;

const TXNS_NODE = 'txns';
const FEE_NODE = 'feeConfig';
const ADDRESSES_BAGGAGE_KEY = 'addresses';
/** expected value: \`OrchestrationAccount<{chainId: 'noble-1'}>\` Remotable */
const NOBLE_ICA_BAGGAGE_KEY = 'nobleICA';

/**
 * CONTRACT METADATA
 * Define shapes for terms and privateArgs validation.
 * This is validated by Zoe when starting the contract.
 */
export const meta = {
  customTermsShape: FastUSDCTermsShape,
  privateArgsShape: {
    // @ts-expect-error TypedPattern not recognized as record
    ...OrchestrationPowersShape,
    assetInfo: M.arrayOf([DenomShape, DenomDetailShape]),
    chainInfo: M.recordOf(M.string(), CosmosChainInfoShapeV1),
    feeConfig: FeeConfigShape,
    marshaller: M.remotable(),
    poolMetricsNode: M.remotable(),
  },
} as ContractMeta<typeof start>;
harden(meta);

/**
 * HELPER: Publish fee config to vstorage
 */
const publishFeeConfig = (
  node: ERemote<StorageNode>,
  marshaller: ERemote<EMarshaller>,
  feeConfig: FeeConfig,
) => {
  const feeNode = E(node).makeChildNode(FEE_NODE);
  void E.when(E(marshaller).toCapData(feeConfig), value =>
    E(feeNode).setValue(JSON.stringify(value)),
  );
};

/**
 * HELPER: Publish contract addresses to vstorage
 */
const publishAddresses = (
  contractNode: ERemote<StorageNode>,
  addresses: ContractRecord,
) => {
  return E(contractNode).setValue(JSON.stringify(addresses));
};

/**
 * MAIN CONTRACT FUNCTION
 *
 * Signature: (zcf, privateArgs, zone, tools) => { creatorFacet, publicFacet }
 *
 * Key patterns demonstrated:
 * 1. Extract terms and validate with assertions
 * 2. Set up recorder kit for vstorage publishing
 * 3. Prepare exos (prepareXxx pattern) before remote calls
 * 4. Use zone.makeOnce for durable singletons
 * 5. Use orchestrateAll to register flows
 * 6. Create creator and public facets with zone.exo
 */
export const contract = async (
  zcf: ZCF<FastUsdcTerms>,
  privateArgs: OrchestrationPowers & {
    assetInfo: [Denom, DenomDetail & { brandKey?: string }][];
    chainInfo: Record<string, ChainHubChainInfo>;
    feeConfig: FeeConfig;
    marshaller: Remote<Marshaller>;
    storageNode: Remote<StorageNode>;
    poolMetricsNode: Remote<StorageNode>;
  },
  zone: Zone,
  tools: OrchestrationTools,
) => {
  assert(tools, 'no tools');
  const terms = zcf.getTerms();
  assert('USDC' in terms.brands, 'no USDC brand');
  assert('usdcDenom' in terms, 'no usdcDenom');

  const { feeConfig, storageNode } = privateArgs;

  // Set up recorder kit for vstorage publishing
  const { cachingMarshaller } = tools;
  const { makeRecorderKit } = prepareRecorderKitMakers(
    zone.mapStore('vstorage'),
    cachingMarshaller,
  );

  const routeHealth = makeRouteHealth(MAX_ROUTE_FAILURES);

  // Prepare status manager exo
  const statusManager = prepareStatusManager(
    zone,
    E(storageNode).makeChildNode(TXNS_NODE),
    { marshaller: cachingMarshaller, routeHealth },
  );

  const { USDC } = terms.brands;
  const { withdrawToSeat } = tools.zoeTools;
  const { baggage, chainHub, orchestrateAll, vowTools } = tools;

  /**
   * BAGGAGE PATTERN: Store remotables that need to survive upgrades
   * Use baggage.get/init/set for storing OrchestrationAccounts
   */
  const getNobleICA = (): OrchestrationAccount<{ chainId: 'noble-1' }> =>
    baggage.get(NOBLE_ICA_BAGGAGE_KEY);

  /**
   * FIRST INCARNATION PATTERN
   * Chain, connection, and asset info should only be registered once.
   * Use a baggage key to track if this is the first incarnation.
   */
  const firstIncarnationKey = 'firstIncarnationKey';
  if (!baggage.has(firstIncarnationKey)) {
    baggage.init(firstIncarnationKey, true);
    registerChainsAndAssets(
      chainHub,
      terms.brands,
      privateArgs.chainInfo,
      privateArgs.assetInfo,
      { log: trace },
    );
  }

  const supportsCctp = makeSupportsCctp(chainHub);

  /**
   * ORCHESTRATE ALL PATTERN
   * Register flows with orchestrateAll, passing context as second arg.
   * Flows are defined in a separate file (flows.ts).
   */
  const { makeLocalAccount, makeNobleAccount } = orchestrateAll(
    {
      makeLocalAccount: flows.makeLocalAccount,
      makeNobleAccount: flows.makeNobleAccount,
    },
    {},
  );

  /**
   * ZONE.MAKEONCE PATTERN
   * Create durable singleton accounts that survive upgrades.
   * The callback is only called on first incarnation.
   */
  const poolAccountV = zone.makeOnce('PoolAccount', () => makeLocalAccount());
  const settleAccountV = zone.makeOnce('SettleAccount', () =>
    makeLocalAccount(),
  );

  // Register flows with context
  const { forwardFunds } = orchestrateAll(
    // @ts-expect-error flow membrane type debt
    { forwardFunds: flows.forwardFunds },
    {
      currentChainReference: privateArgs.chainInfo.agoric.chainId,
      getNobleICA,
      log: makeTracer('ForwardFunds'),
      settlementAccount: settleAccountV,
      supportsCctp,
      statusManager,
    },
  ) as { forwardFunds: HostForGuest<typeof flows.forwardFunds> };

  // Prepare settler exo with dependencies
  const makeSettler = prepareSettler(zone, {
    statusManager,
    USDC,
    withdrawToSeat,
    feeConfig,
    forwardFunds,
    getNobleICA,
    vowTools: tools.vowTools,
    zcf,
    chainHub: { resolveAccountId: chainHub.resolveAccountId.bind(chainHub) },
  });

  const zoeTools = makeZoeTools(zcf, vowTools);

  // More flow registrations with different context...
  const { advanceFunds } = orchestrateAll(
    // @ts-expect-error flow membrane type debt
    { advanceFunds: flows.advanceFunds },
    {
      chainHubTools: {
        getChainInfoByChainId: chainHub.getChainInfoByChainId.bind(chainHub),
        resolveAccountId: chainHub.resolveAccountId.bind(chainHub),
      },
      feeConfig,
      getNobleICA,
      log: makeTracer('AdvanceFunds'),
      settlementAccount: settleAccountV,
      statusManager,
      usdc: harden({
        brand: terms.brands.USDC,
        denom: terms.usdcDenom,
      }),
      zcfTools: harden({
        makeEmptyZCFSeat: () => {
          const { zcfSeat } = zcf.makeEmptySeatKit();
          return zcfSeat;
        },
      }),
      zoeTools,
    },
  ) as { advanceFunds: HostForGuest<typeof flows.advanceFunds> };

  // Prepare more exos...
  const makeAdvancer = prepareAdvancer(zone, {
    advanceFunds,
    chainHub,
    getNobleICA,
    usdc: harden({
      brand: terms.brands.USDC,
      denom: terms.usdcDenom,
    }),
    statusManager,
    vowTools,
    zcf,
    zoeTools,
  });

  const makeFeedKit = prepareTransactionFeedKit(zone, zcf);
  const makeLiquidityPoolKit = prepareLiquidityPoolKit(
    zone,
    zcf,
    terms.brands.USDC,
    { makeRecorderKit },
  );

  /**
   * CREATOR FACET
   * Administrative operations for contract deployer.
   * Use zone.exo for durable singleton facets.
   */
  const creatorFacet = zone.exo('Fast USDC Creator', undefined, {
    async makeOperatorInvitation(
      operatorId: string,
    ): Promise<Invitation<OperatorOfferResult>> {
      return feedKit.creator.makeOperatorInvitation(operatorId);
    },
    removeOperator(operatorId: string): void {
      return feedKit.creator.removeOperator(operatorId);
    },
    async getContractFeeBalance(): Promise<Amount<'nat'>> {
      return poolKit.feeRecipient.getContractFeeBalance();
    },
    async makeWithdrawFeesInvitation(): Promise<Invitation<unknown>> {
      return poolKit.feeRecipient.makeWithdrawFeesInvitation();
    },
    async connectToNoble(
      agoricChainId?: string,
      nobleChainId?: string,
      agoricToNoble?: IBCConnectionInfo,
    ): Promise<CosmosChainAddress> {
      // Dynamic chain connection update
      const shouldUpdate = agoricChainId && nobleChainId && agoricToNoble;
      if (shouldUpdate) {
        trace('connectToNoble', agoricChainId, nobleChainId, agoricToNoble);
        chainHub.updateConnection(agoricChainId, nobleChainId, agoricToNoble);
      }
      const nobleICALabel = \`NobleICA-\${(shouldUpdate ? agoricToNoble : agToNoble).counterparty.connection_id}\`;
      trace('NobleICA', nobleICALabel);

      const nobleAccountV = zone.makeOnce(nobleICALabel, () =>
        makeNobleAccount(),
      );

      return vowTools.when(nobleAccountV, nobleAccount => {
        trace('nobleAccount', nobleAccount);
        // Store in baggage for cross-upgrade access
        if (baggage.has(NOBLE_ICA_BAGGAGE_KEY)) {
          baggage.set(NOBLE_ICA_BAGGAGE_KEY, nobleAccount);
        } else {
          baggage.init(NOBLE_ICA_BAGGAGE_KEY, nobleAccount);
        }
        return nobleAccount.getAddress();
      });
    },
    async publishAddresses() {
      !baggage.has(ADDRESSES_BAGGAGE_KEY) || Fail\`Addresses already published\`;
      const [poolAccountAddress] = await vowTools.when(
        vowTools.all([E(poolAccount).getAddress()]),
      );
      const addresses = harden({
        poolAccount: poolAccountAddress.value,
        settlementAccount: settlementAddress.value,
      });
      baggage.init(ADDRESSES_BAGGAGE_KEY, addresses);
      await publishAddresses(storageNode, addresses);
      return addresses;
    },
    deleteCompletedTxs() {
      return statusManager.deleteCompletedTxs();
    },
    updateChain(chainName: string, chainInfo: ChainInfo): void {
      return chainHub.updateChain(chainName, chainInfo);
    },
    registerChain(chainName: string, chainInfo: ChainInfo): void {
      return chainHub.registerChain(chainName, chainInfo);
    },
  });

  /**
   * PUBLIC FACET
   * Available to anyone with contract instance reference.
   * Provides read access and invitation creation.
   */
  const publicFacet = zone.exo('Fast USDC Public', undefined, {
    makeDepositInvitation() {
      return poolKit.public.makeDepositInvitation();
    },
    makeWithdrawInvitation() {
      return poolKit.public.makeWithdrawInvitation();
    },
    getPublicTopics() {
      return poolKit.public.getPublicTopics();
    },
    getStaticInfo() {
      baggage.has(ADDRESSES_BAGGAGE_KEY) ||
        Fail\`no addresses. creator must 'publishAddresses' first\`;
      const addresses: ContractRecord = baggage.get(ADDRESSES_BAGGAGE_KEY);
      return harden({
        [ADDRESSES_BAGGAGE_KEY]: addresses,
      });
    },
  });

  // ^^^ Define all kinds above this line. Keep remote calls below. vvv

  /**
   * IMPORTANT: All zone.exo/exoClass/exoClassKit calls must happen
   * before any remote calls (like zcf.makeZCFMint).
   * This is because kinds must be defined synchronously.
   */

  publishFeeConfig(storageNode, cachingMarshaller, feeConfig);

  // Remote call to create ZCFMint
  const shareMint = await provideSingleton(
    zone.mapStore('mint'),
    'PoolShare',
    () =>
      zcf.makeZCFMint('PoolShares', AssetKind.NAT, {
        decimalPlaces: 6,
      }),
  );

  // Create kit instances using zone.makeOnce
  const poolKit = zone.makeOnce('Liquidity Pool kit', () =>
    makeLiquidityPoolKit(shareMint, privateArgs.poolMetricsNode),
  );

  const feedKit = zone.makeOnce('Feed Kit', () => makeFeedKit());

  // Resolve account vows
  const [poolAccount, settlementAccount] = (await vowTools.when(
    vowTools.all([poolAccountV, settleAccountV]),
  )) as [
    HostInterface<OrchestrationAccount<{ chainId: 'agoric-any' }>>,
    HostInterface<OrchestrationAccount<{ chainId: 'agoric-any' }>>,
  ];
  trace('settlementAccount', settlementAccount);
  trace('poolAccount', poolAccount);
  const settlementAddress = await E(settlementAccount).getAddress();
  trace('settlementAddress', settlementAddress);

  const [_agoric, _noble, agToNoble] = await vowTools.when(
    chainHub.getChainsAndConnection('agoric', 'noble'),
  );

  const settlerKit = zone.makeOnce('settlerKit', () =>
    makeSettler({
      repayer: poolKit.repayer,
      sourceChannel: agToNoble.transferChannel.counterPartyChannelId,
      remoteDenom: 'uusdc',
      settlementAccount,
    }),
  );

  // Create advancer (recreated on each upgrade as it has no precious state)
  const advancer = makeAdvancer({
    borrower: poolKit.borrower,
    notifier: settlerKit.notifier,
    poolAccount,
    settlementAddress,
  });

  // Connect evidence stream to advancer using observeIteration
  void observeIteration(subscribeEach(feedKit.public.getEvidenceSubscriber()), {
    updateState(evidenceWithRisk) {
      try {
        void advancer.handleTransactionEvent(evidenceWithRisk);
      } catch (err) {
        trace('🚨 Error handling transaction event', err);
      }
    },
  });

  await settlerKit.creator.monitorMintingDeposits();

  startForwardRetrier({
    forwardFunds,
    getForwardsToRetry: statusManager.getForwardsToRetry.bind(statusManager),
    log: trace,
    routeHealth,
    USDC,
  });

  return harden({ creatorFacet, publicFacet });
};
harden(contract);

/**
 * EXPORT START FUNCTION
 * Wrap contract with orchestration support.
 */
export const start = withOrchestration(contract, {
  chainInfoValueShape: CosmosChainInfoShapeV1,
});
harden(start);

export type FastUsdcSF = typeof start;`;

      const goldenFlows = `// --- fast-usdc.flows.ts (Golden Reference Implementation)
// This is a production-grade flows file showing best practices for:
// - OrchestrationFlow type satisfaction
// - Context passing for flow dependencies
// - Error handling and status management
// - IBC transfers with timeouts and forwarding
// - CCTP (Circle's Cross-Chain Transfer Protocol) integration

import type { GuestOf } from '@agoric/async-flow';
import { decodeAddressHook } from '@agoric/cosmic-proto/address-hooks.js';
import { AmountMath, type Brand, type NatAmount } from '@agoric/ertp';
import { AddressHookShape } from '@agoric/fast-usdc/src/type-guards.js';
import type {
  EvidenceWithRisk,
  EvmHash,
  FeeConfig,
} from '@agoric/fast-usdc/src/types.ts';
import { makeFeeTools } from '@agoric/fast-usdc/src/utils/fees.js';
import { assertAllDefined, mustMatch } from '@agoric/internal';
import type {
  AccountId,
  ChainHub,
  CosmosChainAddress,
  Denom,
  OrchestrationAccount,
  OrchestrationFlow,
  Orchestrator,
} from '@agoric/orchestration';
import {
  chainOfAccount,
  parseAccountId,
  parseAccountIdArg,
} from '@agoric/orchestration/src/utils/address.js';
import type { ZoeTools } from '@agoric/orchestration/src/utils/zoe-tools.js';
import type { ZCFSeat } from '@agoric/zoe';
import { Fail, q } from '@endo/errors';
import type { CopyRecord } from '@endo/pass-style';
import type { LiquidityPoolKit } from './exos/liquidity-pool.ts';
import type { SettlerKit } from './exos/settler.ts';
import type { StatusManager } from './exos/status-manager.ts';
import { makeSupportsCctp } from './utils/cctp.ts';

/**
 * TIMEOUT CONFIGURATION
 * Define timeouts as hardened constants for IBC operations.
 */
const FORWARD_TIMEOUT = {
  sec: 10n * 60n,
  p: '10m',
} as const;
harden(FORWARD_TIMEOUT);

/**
 * FLOW CONTEXT TYPE
 * Define the context shape that will be passed to flows.
 * This is the second parameter to orchestrateAll.
 */
export interface Context {
  /** e.g., \`agoric-3\` */
  currentChainReference: string;
  supportsCctp: (destination: AccountId) => boolean;
  log: Console['log'];
  statusManager: StatusManager;
  getNobleICA: () => OrchestrationAccount<{ chainId: 'noble-1' }>;
  settlementAccount: Promise<OrchestrationAccount<{ chainId: 'agoric-any' }>>;
}

/**
 * SIMPLE FLOW: Create a local account
 *
 * Pattern: async function satisfying OrchestrationFlow
 * - Takes Orchestrator as first param
 * - Returns a durable object (OrchestrationAccount)
 */
export const makeLocalAccount = (async (orch: Orchestrator) => {
  const agoricChain = await orch.getChain('agoric');
  return agoricChain.makeAccount();
}) satisfies OrchestrationFlow;
harden(makeLocalAccount);

/**
 * SIMPLE FLOW: Create a Noble account
 */
export const makeNobleAccount = (async (orch: Orchestrator) => {
  const nobleChain = await orch.getChain('noble');
  return nobleChain.makeAccount();
}) satisfies OrchestrationFlow;
harden(makeNobleAccount);

/**
 * COMPLEX FLOW: Forward funds to destination
 *
 * Demonstrates:
 * - Context destructuring for dependencies
 * - Namespace-based routing (cosmos vs CCTP)
 * - Status tracking through statusManager
 * - Error handling with status updates
 * - IBC transfer with timeout and forwarding options
 */
export const forwardFunds = async (
  orch: Orchestrator,
  {
    currentChainReference,
    supportsCctp,
    log,
    getNobleICA,
    settlementAccount,
    statusManager,
  }: Context,
  tx: {
    txHash: EvmHash;
    amount: NatAmount;
    destination: AccountId;
  },
) => {
  await null; // Ensure we're in async context
  assertAllDefined({
    currentChainReference,
    supportsCctp,
    log,
    getNobleICA,
    settlementAccount,
    statusManager,
    tx,
  });
  const { amount, destination, txHash } = tx;
  log('trying forward for', amount, 'to', destination, 'for', txHash);

  const { namespace, reference } = parseAccountId(destination);

  const settlement = await settlementAccount;
  const intermediateRecipient = getNobleICA().getAddress();

  /**
   * COSMOS NAMESPACE ROUTING
   * Handle transfers to Cosmos chains via IBC
   */
  if (namespace === 'cosmos') {
    const completion =
      reference === currentChainReference
        ? // Local transfer (same chain)
          settlement.send(destination, amount)
        : // IBC transfer with forwarding through Noble
          settlement.transfer(destination, amount, {
            timeoutRelativeSeconds: FORWARD_TIMEOUT.sec,
            forwardOpts: {
              intermediateRecipient,
              timeout: FORWARD_TIMEOUT.p,
            },
          });
    try {
      statusManager.forwarding(txHash);
      await completion;
      log('forward successful for', txHash);
      statusManager.forwarded(txHash, {
        txHash,
        destination,
        amount: amount.value,
      });
    } catch (reason) {
      log('⚠️ forward transfer rejected', reason, txHash);
      // funds remain in \`settlementAccount\`
      statusManager.forwardFailed(txHash, {
        txHash,
        destination,
        amount: amount.value,
      });
    }
  } else if (supportsCctp(destination)) {
    /**
     * CCTP ROUTING
     * Handle transfers to EVM chains via Circle's CCTP
     * Two-step: IBC to Noble, then depositForBurn to EVM
     */
    try {
      statusManager.forwarding(txHash);
      await settlement.transfer(intermediateRecipient, amount, {
        timeoutRelativeSeconds: FORWARD_TIMEOUT.sec,
      });
    } catch (reason) {
      log('⚠️ forward intermediate transfer rejected', reason, txHash);
      statusManager.forwardFailed(txHash, {
        txHash,
        destination,
        amount: amount.value,
      });
    }

    const burnAmount = { denom: 'uusdc', value: amount.value };

    try {
      await getNobleICA().depositForBurn(destination, burnAmount);
      log('forward transfer and depositForBurn successful for', txHash);
      statusManager.forwarded(tx.txHash);
    } catch (reason) {
      log('⚠️ forward depositForBurn rejected', reason, txHash);
      // funds remain in \`nobleAccount\`
      statusManager.forwardFailed(txHash, {
        txHash,
        destination,
        amount: amount.value,
        fundsInNobleIca: true,
      });
    }
  } else {
    /**
     * UNSUPPORTED DESTINATION
     * Log and skip - funds remain in settlement account
     */
    log(
      '⚠️ forward not attempted',
      'unsupported destination',
      txHash,
      destination,
    );
    statusManager.forwardSkipped(txHash);
  }
};
harden(forwardFunds);

/**
 * ADVANCE FLOW CONTEXT
 * More complex context for advance operations
 */
export interface ContextAdvance {
  chainHubTools: Pick<ChainHub, 'getChainInfoByChainId' | 'resolveAccountId'>;
  feeConfig: FeeConfig;
  getNobleICA: () => OrchestrationAccount<{ chainId: 'noble-1' }>;
  log: Console['log'];
  statusManager: StatusManager;
  usdc: { brand: Brand<'nat'>; denom: Denom };
  zcfTools: { makeEmptyZCFSeat: () => ZCFSeat };
  zoeTools: ZoeTools;
}

/**
 * COMPLEX FLOW: Advance funds to user before settlement
 *
 * Demonstrates:
 * - Early return for already-seen transactions
 * - Risk assessment integration
 * - Address hook decoding and validation
 * - Fee calculation
 * - Borrowing from liquidity pool
 * - Local transfers between accounts
 * - Multi-step error recovery
 * - Nested try/catch with status updates
 */
export const advanceFunds = (async (
  orch: Orchestrator,
  {
    chainHubTools,
    feeConfig,
    getNobleICA,
    log,
    statusManager,
    usdc,
    zcfTools,
    zoeTools: { localTransfer, withdrawToSeat },
  }: ContextAdvance,
  { evidence, risk }: EvidenceWithRisk,
  config: {
    notifier: SettlerKit['notifier'];
    borrower: LiquidityPoolKit['borrower'];
    poolAccount: OrchestrationAccount<{ chainId: 'agoric-any' }>;
    settlementAddress: CosmosChainAddress;
  } & CopyRecord,
) => {
  const feeTools = makeFeeTools(feeConfig);
  const toAmount = (value: bigint) => AmountMath.make(usdc.brand, value);
  const supportsCctp = makeSupportsCctp(chainHubTools);

  await null;
  try {
    /**
     * IDEMPOTENCY CHECK
     * Skip if we've already seen this transaction
     */
    if (statusManager.hasBeenObserved(evidence)) {
      log('txHash already seen:', evidence.txHash);
      return;
    }

    /**
     * RISK CHECK
     * Skip advance if risks identified
     */
    if (risk.risksIdentified?.length) {
      log('risks identified, skipping advance');
      statusManager.skipAdvance(evidence, risk.risksIdentified);
      return;
    }

    const { settlementAddress } = config;

    /**
     * ADDRESS HOOK DECODING
     * Extract EUD (End User Destination) from address hook
     */
    const { EUD } = (() => {
      const { recipientAddress } = evidence.aux;
      const decoded = decodeAddressHook(recipientAddress);
      mustMatch(decoded, AddressHookShape);
      if (decoded.baseAddress !== settlementAddress.value) {
        throw Fail\`⚠️ baseAddress of address hook \${q(decoded.baseAddress)} does not match the expected address \${q(settlementAddress.value)}\`;
      }
      return decoded.query;
    })();
    log(\`decoded EUD: \${EUD}\`);

    // Validate destination
    const destination = chainHubTools.resolveAccountId(EUD);
    const accountId = parseAccountId(destination);

    // Check destination is supported
    if (!(accountId.namespace === 'cosmos' || supportsCctp(destination))) {
      const destChain = chainOfAccount(destination);
      statusManager.skipAdvance(evidence, [
        \`Transfer to \${destChain} not supported.\`,
      ]);
      return;
    }

    const fullAmount = toAmount(evidence.tx.amount);
    const { borrower, notifier, poolAccount } = config;

    // Check if already minted/settled
    const mintedEarly = notifier.checkMintedEarly(evidence, destination);
    if (mintedEarly) return;

    /**
     * FEE CALCULATION
     * Calculate advance amount after fees
     */
    const advanceAmount = feeTools.calculateAdvance(fullAmount, destination);
    const amount = harden({ denom: usdc.denom, value: advanceAmount.value });

    /**
     * BORROW FROM POOL
     * Create temp seat and borrow from liquidity pool
     */
    const tmpSeat = zcfTools.makeEmptyZCFSeat();
    borrower.borrow(tmpSeat, advanceAmount);

    // Mark as advancing
    statusManager.advance(evidence);
    const detail = {
      txHash: evidence.txHash,
      forwardingAddress: evidence.tx.forwardingAddress,
      fullAmount,
      destination,
    };

    try {
      /**
       * LOCAL TRANSFER
       * Move funds from temp seat to pool account
       */
      await (localTransfer as unknown as GuestOf<typeof localTransfer>)(
        tmpSeat,
        poolAccount,
        harden({ USDC: advanceAmount }),
      );

      tmpSeat.exit();

      const intermediateRecipient = getNobleICA().getAddress();
      const destInfo = parseAccountIdArg(destination);

      if (destInfo.namespace === 'cosmos') {
        try {
          await (destInfo.reference === settlementAddress.chainId
            ? poolAccount.send(destination, amount)
            : poolAccount.transfer(destination, amount, {
                forwardOpts: {
                  intermediateRecipient,
                },
              }));
          log('Advance succeeded', { advanceAmount, destination });
          notifier.notifyAdvancingResult(detail, true);
        } catch (error) {
          await transferRejected(error);
        }
      } else if (supportsCctp(destination)) {
        // CCTP path: transfer to Noble, then depositForBurn
        try {
          await poolAccount.transfer(intermediateRecipient, amount);
        } catch (error) {
          return transferRejected(error);
        }

        const intermediaryAccount = getNobleICA();
        try {
          await intermediaryAccount.depositForBurn(destination, amount);
        } catch (error) {
          return cctpFromNobleRejected(error);
        }

        log('Advance succeeded', { advanceAmount, destination });
        notifier.notifyAdvancingResult(detail, true);
      } else {
        Fail\`🚨 can only transfer to Agoric addresses, via IBC, or via CCTP\`;
      }
    } catch (error) {
      depositRejected(error);
    }

    /**
     * ERROR RECOVERY FUNCTIONS
     * Handle various failure scenarios with appropriate cleanup
     */
    function depositRejected(error: any) {
      log(
        '⚠️ deposit to localOrchAccount failed, attempting to return payment to LP',
        error,
      );
      try {
        notifier.notifyAdvancingResult(detail, false);
        borrower.returnToPool(tmpSeat, advanceAmount);
        tmpSeat.exit();
      } catch (e) {
        log('🚨 deposit to localOrchAccount failure recovery failed', e);
      }
    }

    async function repayPool() {
      const tmpReturnSeat = zcfTools.makeEmptyZCFSeat();
      await null;

      try {
        await (withdrawToSeat as unknown as GuestOf<typeof withdrawToSeat>)(
          poolAccount,
          tmpReturnSeat,
          harden({ USDC: advanceAmount }),
        );

        try {
          borrower.returnToPool(tmpReturnSeat, advanceAmount);
        } catch (e) {
          log(
            \`🚨 return \${q(advanceAmount)} to pool failed. funds remain on "tmpReturnSeat"\`,
            e,
          );
        }
      } catch (error) {
        withdrawRejected(error, tmpReturnSeat);
      }
    }

    async function transferRejected(reason: any) {
      log('Advance failed', reason);
      notifier.notifyAdvancingResult(detail, false);
      return repayPool();
    }

    function withdrawRejected(error: any, tmpReturnSeat: ZCFSeat) {
      log(
        \`🚨 withdraw \${q(advanceAmount)} from "poolAccount" to return to pool failed\`,
        error,
      );
      tmpReturnSeat.exit();
    }

    async function cctpFromNobleRejected(reason: any) {
      log('⚠️ CCTP transfer failed', reason);
      notifier.notifyAdvancingResult(detail, false);
      await null;
      try {
        await getNobleICA().transfer(poolAccount.getAddress(), amount);
      } catch (error) {
        log('🚨 failed to transfer back from noble ICA', amount.value, error);
      }
      return repayPool();
    }
  } catch (error) {
    log('Advancer error:', error);
    statusManager.skipAdvance(evidence, [(error as Error).message]);
  }
}) satisfies OrchestrationFlow;
harden(advanceFunds);`;

      const keyPatterns = {
        contract_patterns: [
          'Use meta object for customTermsShape and privateArgsShape validation',
          'Define all zone.exo/exoClass/exoClassKit before remote calls',
          'Use zone.makeOnce for durable singletons that survive upgrades',
          'Use baggage for storing remotables across upgrades',
          'Use firstIncarnationKey pattern for one-time initialization',
          'Prepare exos with prepareXxx pattern for reusable makers',
          'Use orchestrateAll to register flows with context',
          'Creator facet for admin operations, public facet for user access',
          'Publish to vstorage using recorder kit and marshaller',
        ],
        flow_patterns: [
          'Flows satisfy OrchestrationFlow type',
          'First param is Orchestrator, second is context',
          'Use await null at start to ensure async context',
          'Use assertAllDefined for runtime validation',
          'Implement idempotency checks (hasBeenObserved)',
          'Track status through statusManager',
          'Handle errors with status updates (forwarding, forwarded, forwardFailed)',
          'Use parseAccountId for namespace-based routing',
          'Support multiple transfer paths (local, IBC, CCTP)',
          'Implement error recovery with cleanup functions',
        ],
        best_practices: [
          'Always harden exported functions and objects',
          'Use makeTracer for consistent logging',
          'Define timeout constants as hardened objects',
          'Use destructuring for context parameters',
          'Implement comprehensive error recovery',
          'Track transaction status at each step',
          'Validate inputs with mustMatch and type guards',
          'Use zcfTools.makeEmptyZCFSeat for temporary seats',
          'Clean up seats on both success and failure paths',
        ],
      };

      let response: Record<string, unknown>;

      if (component === 'contract') {
        response = {
          description:
            'Golden reference contract implementation from fast-usdc',
          code: goldenContract,
          key_patterns: keyPatterns.contract_patterns,
          usage_notes: [
            'This is a production contract - adapt patterns to your needs',
            'The contract demonstrates zone management, orchestration, and facet design',
            'Study the prepare/makeOnce patterns for durable state',
          ],
        };
      } else if (component === 'flows') {
        response = {
          description:
            'Golden reference flows implementation from fast-usdc',
          code: goldenFlows,
          key_patterns: keyPatterns.flow_patterns,
          usage_notes: [
            'Flows handle async orchestration operations',
            'Context provides dependencies without closures',
            'Error handling updates status for observability',
          ],
        };
      } else {
        response = {
          description:
            'Golden reference implementation from fast-usdc showing production-grade patterns',
          contract: {
            code: goldenContract,
            patterns: keyPatterns.contract_patterns,
          },
          flows: {
            code: goldenFlows,
            patterns: keyPatterns.flow_patterns,
          },
          best_practices: keyPatterns.best_practices,
          usage_notes: [
            'Use these as primary reference when building new contracts',
            'Adapt patterns to your specific requirements',
            'The contract and flows work together - study both',
            'Pay attention to error handling and status management',
          ],
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
