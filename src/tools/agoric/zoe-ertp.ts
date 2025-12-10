import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

const zoeGuideData = {
  zcf_methods: {
    makeInvitation: {
      signature:
        'zcf.makeInvitation(offerHandler, description, customDetails?, proposalShape?)',
      description: 'Create an invitation for users to participate',
      parameters: {
        offerHandler: 'Async function receiving the seat',
        description: 'Human-readable string',
        customDetails: 'Optional metadata object',
        proposalShape: 'Optional pattern to validate proposals',
      },
    },
    getTerms: {
      signature: 'zcf.getTerms()',
      description: 'Returns contract terms including brands and issuers',
      returns: '{ brands, issuers, ...customTerms }',
    },
    setOfferFilter: {
      signature: 'zcf.setOfferFilter(strings)',
      description: 'Restrict which invitation descriptions are allowed',
    },
    makeZCFMint: {
      signature: 'zcf.makeZCFMint(keyword, assetKind?)',
      description: 'Create a new mint managed by the contract',
    },
    atomicRearrange: {
      signature: 'zcf.atomicRearrange(transfers)',
      description: 'Atomically move assets between seats',
    },
  },
  seat_methods: {
    getProposal: {
      signature: 'seat.getProposal()',
      returns:
        '{ give: { [Keyword]: Amount }, want: { [Keyword]: Amount }, exit }',
    },
    getCurrentAllocation: {
      signature: 'seat.getCurrentAllocation()',
      description: 'Returns current assets held by seat',
    },
    hasExited: {
      signature: 'seat.hasExited()',
      description:
        'Check if seat has already exited - ALWAYS check before operations',
    },
    exit: {
      signature: 'seat.exit()',
      description: 'Successfully complete the offer',
    },
    fail: {
      signature: 'seat.fail(reason)',
      description: 'Fail the offer with a reason, triggers automatic refund',
    },
  },
  seat_lifecycle: [
    '1. User makes offer with proposal and payments',
    '2. Zoe escrows payments and creates seat',
    '3. Offer handler receives seat',
    '4. Contract can reallocate assets between seats',
    '5. Seat exits (success) or fails (refund)',
    '6. User receives payout based on final allocation',
  ],
  best_practices: [
    'Always check seat.hasExited() before operations',
    'Exit seats as soon as operation is complete',
    'Provide meaningful error messages in seat.fail()',
    'Use proposal shapes to validate before handler runs',
    'Never store seats in durable state',
  ],
};

const invitationPatternsData = {
  basic_invitation: {
    description: 'Simple one-time invitation',
    code: `const handler = async (seat) => {
  const { give, want } = seat.getProposal();
  // Process offer
  seat.exit();
  return 'success';
};

return zcf.makeInvitation(handler, 'myOperation');`,
  },
  continuing_invitation: {
    description: 'Returns invitation makers for follow-up operations',
    code: `const handler = async (seat) => {
  // Initial setup
  const accountKit = makeAccountKit(...);
  seat.exit();
  return harden({ invitationMakers: accountKit.invitationMakers });
};

return zcf.makeInvitation(handler, 'createAccount');`,
    usage:
      'User exercises invitation, gets invitationMakers, can create more invitations',
  },
  with_proposal_shape: {
    description: 'Invitation with proposal validation',
    code: `const proposalShape = M.splitRecord({
  give: M.splitRecord({ Deposit: AmountShape }),
  want: {},
});

return zcf.makeInvitation(
  handler,
  'depositFunds',
  undefined,
  proposalShape
);`,
  },
  invitation_maker_facet: {
    description: 'Standard pattern for invitation maker in account kit',
    code: `invitationMakers: {
  makeOperationInvitation(method, args) {
    const handler = async (seat) => {
      const { holder } = this.facets;
      switch (method) {
        case 'send':
          return holder.send(args[0], args[1]);
        default:
          throw makeError(\`Unknown method: \${q(method)}\`);
      }
    };
    return zcf.makeInvitation(handler, 'operation');
  },
}`,
  },
};

const proposalShapesData = {
  overview:
    'Proposal shapes validate the structure of user proposals before the offer handler runs',
  amount_shape_helper: {
    code: `/**
 * @param {Brand<'nat'>} brand
 * @param {bigint} [min] optional minimum
 */
const makeNatAmountShape = (brand, min) =>
  harden({
    brand,
    value: min ? M.and(M.nat(), M.gte(min)) : M.nat()
  });`,
    usage: 'const BLDAmountShape = makeNatAmountShape(brands.BLD, 1n);',
  },
  patterns: {
    give_only: {
      description: 'User gives assets, wants nothing specific',
      code: `const proposalShape = M.splitRecord({
  give: M.splitRecord({ Deposit: BLDAmountShape }),
  want: {},
});`,
    },
    want_only: {
      description: 'User wants assets, gives nothing',
      code: `const proposalShape = M.splitRecord({
  give: {},
  want: M.splitRecord({ Payout: TokenAmountShape }),
});`,
    },
    give_and_want: {
      description: 'User gives one asset, wants another',
      code: `const proposalShape = M.splitRecord({
  give: M.splitRecord({ In: TokenAShape }),
  want: M.splitRecord({ Out: TokenBShape }),
});`,
    },
    optional_keywords: {
      description: 'Some keywords are optional',
      code: `const proposalShape = M.splitRecord(
  { give: M.splitRecord({ Required: AmountShape }) },
  { want: M.splitRecord({}, { Optional: AmountShape }) }
);`,
    },
  },
  validation_timing:
    'Proposal shapes are validated by Zoe before the offer handler is called, providing early rejection of malformed offers',
};

const amountMathData = {
  import: "import { AmountMath } from '@agoric/ertp';",
  concepts: {
    amount: 'A description { brand, value } - NOT actual assets',
    brand: 'Identifies the type of asset',
    value: "The quantity (BigInt for 'nat' kind)",
  },
  operations: {
    creation: {
      make: {
        signature: 'AmountMath.make(brand, value)',
        example: 'const amt = AmountMath.make(brands.BLD, 100n);',
        notes: 'Creates an amount from brand and value',
      },
      makeEmpty: {
        signature: 'AmountMath.makeEmpty(brand, assetKind?)',
        example: 'const empty = AmountMath.makeEmpty(brands.BLD);',
        notes: 'Creates a zero amount',
      },
    },
    arithmetic: {
      add: {
        signature: 'AmountMath.add(a1, a2)',
        example: 'const total = AmountMath.add(amt1, amt2);',
        notes: 'Both amounts must have same brand',
      },
      subtract: {
        signature: 'AmountMath.subtract(a1, a2)',
        example: 'const remainder = AmountMath.subtract(total, spent);',
        notes: 'a1 must be >= a2, same brand required',
      },
    },
    comparison: {
      isEqual: {
        signature: 'AmountMath.isEqual(a1, a2)',
        example: 'if (AmountMath.isEqual(given, required)) { ... }',
      },
      isGTE: {
        signature: 'AmountMath.isGTE(a1, a2)',
        example: 'AmountMath.isGTE(balance, withdrawal) || Fail`Insufficient`;',
      },
      isEmpty: {
        signature: 'AmountMath.isEmpty(amount)',
        example: 'if (AmountMath.isEmpty(refund)) { ... }',
      },
    },
    validation: {
      coerce: {
        signature: 'AmountMath.coerce(brand, amount)',
        example:
          'const validated = AmountMath.coerce(brands.BLD, userAmount);',
        notes: 'Validates and normalizes an amount',
      },
    },
  },
  best_practices: [
    'Always use AmountMath for arithmetic - handles edge cases',
    'Validate amounts match expected brand before operations',
    'Amounts are descriptions, safe to pass around',
    'Use coerce() when receiving amounts from untrusted sources',
  ],
};

const seatLifecycleData = {
  lifecycle_stages: [
    '1. User makes offer with proposal and payments',
    '2. Zoe escrows payments, creates seat',
    '3. Offer handler receives seat',
    '4. Contract processes, may reallocate',
    '5. Seat exits or fails',
    '6. User receives payout',
  ],
  patterns: {
    success_exit: {
      description: 'Normal successful completion',
      code: `async function handler(seat) {
  const { give } = seat.getProposal();

  // Process the offer
  await doOperation(give);

  // Exit successfully
  seat.exit();
  return 'success';
}`,
    },
    failure_with_reason: {
      description: 'Explicit failure with refund',
      code: `async function handler(seat) {
  try {
    await riskyOperation();
    seat.exit();
  } catch (e) {
    seat.fail(makeError(\`Operation failed: \${q(e)}\`));
    throw e;
  }
}`,
    },
    check_before_operation: {
      description: 'Always check hasExited before operations',
      code: `async function handler(seat) {
  // After any await, check if seat is still valid
  await someAsyncOperation();

  if (seat.hasExited()) {
    throw makeError('Seat exited during operation');
  }

  // Safe to continue
  seat.exit();
}`,
    },
    partial_failure_recovery: {
      description: 'Handle partial completion with refunds',
      code: `async function handler(seat) {
  let transferred = 0n;
  const { give } = seat.getProposal();
  const total = give.Deposit.value;

  try {
    for (const op of operations) {
      await executeOp(op);
      transferred += op.amount;
    }
    seat.exit();
  } catch (e) {
    // Refund remaining
    const remaining = total - transferred;
    if (remaining > 0n) {
      await withdrawToSeat(seat, remaining);
    }
    seat.fail(\`Partial failure: \${transferred} transferred, \${remaining} refunded\`);
  }
}`,
    },
  },
  critical_rules: [
    'ALWAYS check hasExited() before seat operations after any await',
    'Exit seats as soon as the operation completes',
    'Never store seats in durable state - they are ephemeral',
    'Use seat.fail() with descriptive reasons',
    'Failed seats automatically refund escrowed assets',
  ],
};

export const registerZoeERTPTools = (server: McpServer) => {
  server.tool(
    'agoric_zoe_guide',
    'Comprehensive guide to ZCF (Zoe Contract Facet) methods and seat management. Covers API reference and common patterns.',
    {
      focus: z
        .enum(['zcf', 'seats', 'invitations', 'all'])
        .default('all')
        .describe('Specific topic to focus on'),
    },
    async ({ focus }) => {
      let response: Record<string, unknown>;

      if (focus === 'zcf') {
        response = {
          zcf_methods: zoeGuideData.zcf_methods,
          best_practices: zoeGuideData.best_practices.filter(
            (p) => !p.includes('seat'),
          ),
        };
      } else if (focus === 'seats') {
        response = {
          seat_methods: zoeGuideData.seat_methods,
          seat_lifecycle: zoeGuideData.seat_lifecycle,
          best_practices: zoeGuideData.best_practices.filter((p) =>
            p.toLowerCase().includes('seat'),
          ),
        };
      } else if (focus === 'invitations') {
        response = {
          makeInvitation: zoeGuideData.zcf_methods.makeInvitation,
          best_practices: [
            'Use proposal shapes to validate before handler runs',
            'Provide descriptive invitation names',
            'Include relevant customDetails for UI display',
          ],
        };
      } else {
        response = zoeGuideData;
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
    'agoric_invitation_patterns',
    'Patterns for creating and validating invitations. Shows code examples for invitation makers and proper validation.',
    {
      patternType: z
        .enum(['basic', 'continuing', 'proposal_shape', 'all'])
        .default('all')
        .describe('Type of invitation pattern to show'),
    },
    async ({ patternType }) => {
      let response: Record<string, unknown>;

      if (patternType === 'basic') {
        response = {
          basic_invitation: invitationPatternsData.basic_invitation,
        };
      } else if (patternType === 'continuing') {
        response = {
          continuing_invitation: invitationPatternsData.continuing_invitation,
          invitation_maker_facet: invitationPatternsData.invitation_maker_facet,
        };
      } else if (patternType === 'proposal_shape') {
        response = {
          with_proposal_shape: invitationPatternsData.with_proposal_shape,
        };
      } else {
        response = invitationPatternsData;
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
    'agoric_proposal_shapes',
    'Guide to defining proposal shapes for give/want validation. Shows pattern examples for common proposal structures.',
    {
      scenario: z
        .enum(['give_only', 'want_only', 'give_and_want', 'optional', 'all'])
        .default('all')
        .describe('Type of proposal shape example'),
    },
    async ({ scenario }) => {
      let response: Record<string, unknown>;

      if (scenario === 'all') {
        response = proposalShapesData;
      } else if (scenario === 'optional') {
        response = {
          overview: proposalShapesData.overview,
          pattern: proposalShapesData.patterns.optional_keywords,
          validation_timing: proposalShapesData.validation_timing,
        };
      } else {
        const patternKey = scenario as keyof typeof proposalShapesData.patterns;
        response = {
          overview: proposalShapesData.overview,
          amount_shape_helper: proposalShapesData.amount_shape_helper,
          pattern: proposalShapesData.patterns[patternKey],
          validation_timing: proposalShapesData.validation_timing,
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
    'agoric_amount_math',
    'Guide to AmountMath operations in ERTP. Covers API reference and common operations for working with amounts.',
    {
      operationType: z
        .enum(['arithmetic', 'comparison', 'creation', 'all'])
        .default('all')
        .describe('Specific operation category to focus on'),
    },
    async ({ operationType }) => {
      let response: Record<string, unknown>;

      if (operationType === 'all') {
        response = amountMathData;
      } else {
        response = {
          import: amountMathData.import,
          concepts: amountMathData.concepts,
          operations: {
            [operationType]:
              amountMathData.operations[
                operationType as keyof typeof amountMathData.operations
              ],
          },
          best_practices: amountMathData.best_practices,
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
    'agoric_seat_lifecycle',
    'Guide to proper seat handling in Zoe contracts. Covers exit/fail patterns, staged allocations, and common mistakes.',
    {
      scenario: z
        .enum(['success', 'failure', 'partial', 'all'])
        .default('all')
        .describe('Specific seat scenario to focus on'),
    },
    async ({ scenario }) => {
      let response: Record<string, unknown>;

      if (scenario === 'all') {
        response = seatLifecycleData;
      } else if (scenario === 'success') {
        response = {
          lifecycle_stages: seatLifecycleData.lifecycle_stages,
          pattern: seatLifecycleData.patterns.success_exit,
          critical_rules: seatLifecycleData.critical_rules,
        };
      } else if (scenario === 'failure') {
        response = {
          lifecycle_stages: seatLifecycleData.lifecycle_stages,
          patterns: {
            failure_with_reason: seatLifecycleData.patterns.failure_with_reason,
            check_before_operation:
              seatLifecycleData.patterns.check_before_operation,
          },
          critical_rules: seatLifecycleData.critical_rules,
        };
      } else if (scenario === 'partial') {
        response = {
          lifecycle_stages: seatLifecycleData.lifecycle_stages,
          pattern: seatLifecycleData.patterns.partial_failure_recovery,
          critical_rules: seatLifecycleData.critical_rules,
        };
      } else {
        response = seatLifecycleData;
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
