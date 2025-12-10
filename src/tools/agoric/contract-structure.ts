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
};
