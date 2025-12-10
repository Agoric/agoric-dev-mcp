import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

const securityChecklistData = {
  hardening: [
    '☐ All exports are hardened',
    '☐ All return values are hardened',
    '☐ All objects passed to callbacks are hardened',
    '☐ Module-level constants are hardened',
  ],
  input_validation: [
    '☐ All external inputs validated with patterns',
    '☐ Validation happens at trust boundaries',
    '☐ Arrays have length limits to prevent DoS',
    '☐ Strings validated for format where applicable',
  ],
  amount_safety: [
    '☐ Amounts validated as positive before operations',
    '☐ Brands validated to match expected',
    '☐ AmountMath used for all arithmetic',
    '☐ Total amounts verified against proposals',
  ],
  address_validation: [
    '☐ EVM addresses validated (0x prefix, length 42)',
    '☐ Cosmos addresses validated (bech32 format)',
    '☐ Address validation happens before use',
  ],
  seat_management: [
    '☐ hasExited() checked before operations',
    '☐ Seats exited promptly after completion',
    '☐ Meaningful reasons provided to seat.fail()',
    '☐ No seats stored in durable state',
  ],
  error_handling: [
    '☐ Errors include context for debugging',
    '☐ Sensitive data not leaked in errors',
    '☐ Recovery logic handles partial failures',
    '☐ Remaining assets refunded on failure',
  ],
  proposal_shapes: [
    '☐ Proposal shapes defined for all invitations',
    '☐ Required keywords enforced',
    '☐ Amount constraints specified',
  ],
  state_safety: [
    '☐ No functions stored in durable state',
    '☐ No Promises stored (Vows used instead)',
    '☐ State shape validated on initialization',
  ],
};

const inputValidationData = {
  general_pattern: {
    description: 'Validate at function entry points',
    code: `async function processMessage(message) {
  // Validate immediately on entry
  mustMatch(message, MessageShape);

  // Now safe to use message
  const { destinationChain, amount } = message;
  // ...
}`,
  },
  message_validation: {
    description: 'Validate cross-chain messages',
    code: `const validateMessage = async (message, state) => {
  const { destinationChain, chainType, payload } = message;

  // Validate chain type
  if (chainType === 'evm') {
    mustMatch(payload, EvmPayloadShape);
    if (!state.transferChannels.Axelar) {
      throw makeError('GMP not enabled');
    }
  } else if (chainType === 'cosmos') {
    mustMatch(payload, CosmosPayloadShape);
  } else {
    throw Fail\`Invalid chainType: \${q(chainType)}\`;
  }

  return { validated: true };
};`,
  },
  amount_validation: {
    description: 'Validate amounts are positive and match',
    code: `const { give } = seat.getProposal();
const amount = give.Deposit;

// Validate positive
amount.value > 0n || Fail\`Amount must be positive, got \${q(amount.value)}\`;

// Validate total matches
const totalRequired = messages.reduce(
  (acc, msg) => acc + BigInt(msg.amountForChain) + BigInt(msg.amountFee || 0),
  0n
);

totalRequired === amount.value ||
  Fail\`Required \${q(totalRequired)} but got \${q(amount.value)}\`;`,
  },
  address_validation: {
    description: 'Validate address formats',
    code: `const isValidEvmAddress = (addr) => {
  return typeof addr === 'string' &&
    addr.startsWith('0x') &&
    addr.length === 42 &&
    /^0x[a-fA-F0-9]{40}$/.test(addr);
};

const isValidBech32Address = (addr, prefix) => {
  return typeof addr === 'string' &&
    addr.startsWith(prefix) &&
    addr.length > prefix.length + 1;
};

// Usage
isValidEvmAddress(address) || Fail\`Invalid EVM address: \${q(address)}\`;`,
  },
};

const errorRecoveryData = {
  pattern: {
    description: 'Track progress and recover on failure',
    principles: [
      'Track what has been successfully completed',
      'Calculate remaining resources on failure',
      'Refund remaining to user',
      'Provide detailed failure information',
    ],
  },
  batch_transfer_recovery: {
    code: `async sendTransactions(seat, offerArgs) {
  let transferredAmount = 0n;
  const successfulTransfers = [];
  const { give } = seat.getProposal();
  const totalAmount = give.Deposit.value;

  try {
    // Validate all first
    const validated = await Promise.all(
      offerArgs.messages.map(msg => validateMessage(msg))
    );

    // Execute sequentially
    for (const item of validated) {
      const amount = BigInt(item.message.amountForChain);

      await this.state.localAccount.transfer(
        item.destination,
        { denom: item.denom, value: amount },
        { memo: item.memo }
      );

      transferredAmount += amount;
      successfulTransfers.push(item);
    }

    seat.exit();
    return 'success';

  } catch (e) {
    const remaining = totalAmount - transferredAmount;

    // Refund remaining
    if (remaining > 0n) {
      const refundAmount = AmountMath.make(give.Deposit.brand, remaining);
      await zoeTools.withdrawToSeat(
        this.state.localAccount,
        seat,
        refundAmount
      );
    }

    const errorMsg = \`Failed after \${successfulTransfers.length} transfers. \` +
      \`Sent: \${transferredAmount}, Refunded: \${remaining}\`;

    if (!seat.hasExited()) {
      seat.fail(errorMsg);
    }

    throw makeError(errorMsg);
  }
}`,
  },
  single_transfer_recovery: {
    code: `async function handleTransfer(seat, destination, amount) {
  try {
    await account.transfer(destination, amount);
    seat.exit();
    return 'success';
  } catch (e) {
    // Full refund on failure
    if (!seat.hasExited()) {
      seat.fail(\`Transfer failed: \${q(e.message)}\`);
    }
    throw e;
  }
}`,
  },
  reporting: {
    description: 'Provide detailed failure information',
    fields: [
      'Number of successful operations',
      'Amount successfully transferred',
      'Amount refunded',
      'Which operation failed and why',
    ],
  },
};

export const registerSecurityTools = (server: McpServer) => {
  server.tool(
    'agoric_security_checklist',
    'Security review checklist for Agoric smart contracts. Covers patterns to verify before deployment.',
    {
      detailLevel: z
        .enum(['quick', 'comprehensive'])
        .default('comprehensive')
        .describe('Level of detail in the checklist'),
    },
    async ({ detailLevel }) => {
      let response: Record<string, unknown>;

      if (detailLevel === 'quick') {
        response = {
          hardening: securityChecklistData.hardening,
          input_validation: securityChecklistData.input_validation,
          seat_management: securityChecklistData.seat_management,
          error_handling: securityChecklistData.error_handling,
        };
      } else {
        response = securityChecklistData;
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
    'agoric_input_validation',
    'Patterns for input validation in Agoric contracts. Shows validation code patterns using @endo/patterns.',
    {
      inputType: z
        .enum(['messages', 'amounts', 'addresses', 'general', 'all'])
        .default('all')
        .describe('Type of input validation to show'),
    },
    async ({ inputType }) => {
      let response: Record<string, unknown>;

      if (inputType === 'all') {
        response = inputValidationData;
      } else if (inputType === 'messages') {
        response = {
          general_pattern: inputValidationData.general_pattern,
          message_validation: inputValidationData.message_validation,
        };
      } else if (inputType === 'amounts') {
        response = {
          amount_validation: inputValidationData.amount_validation,
        };
      } else if (inputType === 'addresses') {
        response = {
          address_validation: inputValidationData.address_validation,
        };
      } else {
        response = {
          general_pattern: inputValidationData.general_pattern,
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
    'agoric_error_recovery',
    'Patterns for handling partial failures in Agoric contracts. Covers recovery patterns including refunds and rollbacks.',
    {
      scenario: z
        .enum(['transfer', 'batch', 'general', 'all'])
        .default('all')
        .describe('Failure scenario to address'),
    },
    async ({ scenario }) => {
      let response: Record<string, unknown>;

      if (scenario === 'all') {
        response = errorRecoveryData;
      } else if (scenario === 'transfer') {
        response = {
          pattern: errorRecoveryData.pattern,
          single_transfer_recovery: errorRecoveryData.single_transfer_recovery,
          reporting: errorRecoveryData.reporting,
        };
      } else if (scenario === 'batch') {
        response = {
          pattern: errorRecoveryData.pattern,
          batch_transfer_recovery: errorRecoveryData.batch_transfer_recovery,
          reporting: errorRecoveryData.reporting,
        };
      } else {
        response = {
          pattern: errorRecoveryData.pattern,
          reporting: errorRecoveryData.reporting,
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
