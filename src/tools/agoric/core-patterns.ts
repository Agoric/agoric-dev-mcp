import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

const hardeningGuideData = {
  overview:
    'In Secure ECMAScript (SES), all objects must be hardened to prevent unexpected mutations. Hardening deeply freezes an object and its prototype chain, making it tamper-proof. This is essential for security in smart contracts where untrusted code may interact with your objects.',
  rules: [
    'Harden all exports immediately after definition',
    'Harden return values from functions',
    'Harden objects passed to other functions',
    'Harden objects stored in durable state',
  ],
  patterns: {
    export_constant:
      "const FOO = { bar: 'baz' };\nharden(FOO);\nexport { FOO };",
    export_function:
      'export const myFn = (x) => {\n  return harden({ result: x * 2 });\n};\nharden(myFn);',
    return_value: 'return harden({ result, data });',
    module_end:
      'harden(contract);\nexport const start = withOrchestration(contract);\nharden(start);',
  },
  common_mistakes: [
    {
      mistake: 'Forgetting to harden exported objects',
      consequence: 'Objects can be mutated by consumers',
      fix: 'Always harden immediately after definition',
    },
    {
      mistake: 'Hardening after export',
      consequence: 'Object may already be accessed unhardened',
      fix: 'Harden before export statement',
    },
    {
      mistake: 'Not hardening function return values',
      consequence: 'Callers can modify returned objects',
      fix: 'Wrap return values with harden()',
    },
    {
      mistake: 'Trying to modify hardened objects',
      consequence: 'Silent failure in sloppy mode, error in strict mode',
      fix: 'Create new objects instead of mutating',
    },
  ],
  ses_restrictions: [
    'No eval() or Function() constructor',
    'No globalThis mutations',
    'Limited Date.now() and Math.random() (return NaN)',
    'No RegExp.$1 and similar legacy features',
    'No __proto__ assignment',
  ],
};

const patternsGuideData = {
  import_statement: "import { M, mustMatch } from '@endo/patterns';",
  matchers: {
    primitives: {
      'M.string()': 'Matches any string',
      'M.number()': 'Matches any number including NaN, Infinity',
      'M.boolean()': 'Matches true or false',
      'M.bigint()': 'Matches BigInt values',
      'M.nat()': 'Matches non-negative BigInt (natural numbers)',
      'M.undefined()': 'Matches undefined',
      'M.null()': 'Matches null',
    },
    numeric_constraints: {
      'M.gte(n)': 'Greater than or equal to n',
      'M.lte(n)': 'Less than or equal to n',
      'M.gt(n)': 'Greater than n',
      'M.lt(n)': 'Less than n',
    },
    collections: {
      'M.array()': 'Matches any array',
      'M.arrayOf(pattern)': 'Array where all elements match pattern',
      'M.arrayOf(pattern, { arrayLengthLimit: n })': 'With max length',
      'M.record()': 'Matches any plain object',
      'M.recordOf(keyPattern, valuePattern)':
        'Object with matching keys/values',
    },
    objects: {
      'M.splitRecord(required, optional, rest)':
        'Primary way to match object shapes',
    },
    combinators: {
      'M.or(p1, p2, ...)': 'Matches if any pattern matches (union)',
      'M.and(p1, p2, ...)': 'Matches if all patterns match (intersection)',
      'M.not(pattern)': 'Matches if pattern does NOT match',
    },
    special: {
      'M.any()': 'Matches anything (use sparingly)',
      'M.remotable(name)': 'Matches a Far object (remote reference)',
      'M.promise()': 'Matches a promise',
      'M.eref(pattern)': 'Matches pattern or promise resolving to it',
    },
    interfaces: {
      'M.interface(name, methodGuards)': 'Defines interface for exo objects',
      'M.call(...args).returns(ret)': 'Sync method signature',
      'M.callWhen(...args).returns(ret)': 'Async method signature',
    },
  },
  usage_example:
    "const MyShape = M.splitRecord({\n  name: M.string(),\n  age: M.and(M.number(), M.gte(0))\n}, {\n  email: M.string()\n});\nharden(MyShape);\n\n// Validate\nmustMatch(data, MyShape);",
  best_practices: [
    'Define patterns as module-level constants',
    'Always harden pattern definitions',
    'Use TypedPattern JSDoc for IDE support',
    'Prefer specific patterns over M.any()',
    'Use arrayLengthLimit to prevent DoS',
  ],
};

const errorHandlingData = {
  import_statement: "import { makeError, Fail, q } from '@endo/errors';",
  functions: {
    makeError: {
      signature: 'makeError(message, errorName?)',
      description: 'Creates an error with proper stack trace',
      example: "throw makeError('Invalid amount provided');",
    },
    Fail: {
      signature: 'Fail`template ${q(value)}`',
      description: 'Template literal that throws immediately',
      example: 'amount > 0n || Fail`Amount must be positive, got ${q(amount)}`;',
    },
    q: {
      signature: 'q(value)',
      description: 'Quotes a value for safe inclusion in error messages',
      example: 'Fail`Unknown chain: ${q(chainName)}`',
    },
  },
  patterns: {
    assertion_style: 'condition || Fail`Expected X but got ${q(actual)}`;',
    guard_clause:
      "if (!condition) {\n  throw makeError('Descriptive error');\n}",
    with_recovery:
      'try {\n  // operation\n} catch (e) {\n  // cleanup\n  throw makeError(`Operation failed: ${q(e)}`);\n}',
  },
  best_practices: [
    'Always use q() for dynamic values in error messages',
    'Be specific about what went wrong',
    'Include relevant values for debugging',
    "Don't leak sensitive information",
    'Use seat.fail() for offer-related errors',
  ],
};

export const registerCorePatternTools = (server: McpServer) => {
  server.tool(
    'agoric_hardening_guide',
    'Learn how to properly use harden() in Agoric contracts. Explains why hardening is required, common patterns, and mistakes to avoid.',
    {
      detailLevel: z
        .enum(['quick', 'standard', 'comprehensive'])
        .default('standard')
        .describe('Level of detail in the response'),
    },
    async ({ detailLevel }) => {
      let response: Record<string, unknown>;

      if (detailLevel === 'quick') {
        response = {
          overview: hardeningGuideData.overview,
          rules: hardeningGuideData.rules,
        };
      } else if (detailLevel === 'standard') {
        response = {
          overview: hardeningGuideData.overview,
          rules: hardeningGuideData.rules,
          patterns: hardeningGuideData.patterns,
          ses_restrictions: hardeningGuideData.ses_restrictions,
        };
      } else {
        response = hardeningGuideData;
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
    'agoric_patterns_guide',
    'Guide to using @endo/patterns and M matchers for runtime type validation. Covers pattern syntax and examples for each matcher type.',
    {
      category: z
        .enum([
          'all',
          'primitives',
          'collections',
          'objects',
          'combinators',
          'special',
          'interfaces',
        ])
        .default('all')
        .describe('Filter by matcher category'),
    },
    async ({ category }) => {
      let response: Record<string, unknown>;

      if (category === 'all') {
        response = patternsGuideData;
      } else {
        const matchers =
          patternsGuideData.matchers[
            category as keyof typeof patternsGuideData.matchers
          ];
        response = {
          import_statement: patternsGuideData.import_statement,
          matchers: { [category]: matchers },
          usage_example: patternsGuideData.usage_example,
          best_practices: patternsGuideData.best_practices,
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
    'agoric_pattern_example',
    'Generate an Endo pattern for a given type shape description. Useful for creating validation patterns for complex data structures.',
    {
      typeDescription: z
        .string()
        .describe(
          'Description of the type shape (e.g., "object with name string, age number, optional email")',
        ),
      typeName: z
        .string()
        .optional()
        .describe('Name for the pattern constant'),
      includeJsdoc: z
        .boolean()
        .default(true)
        .describe('Include JSDoc typedef'),
    },
    async ({ typeDescription, typeName, includeJsdoc }) => {
      // This is a placeholder that returns an example structure
      // In a full implementation, this would use AI/parsing to generate patterns
      const patternName = typeName || 'GeneratedShape';

      const response = {
        pattern: `/** @type {TypedPattern<${patternName.replace('Shape', '')}>} */\nconst ${patternName} = M.splitRecord(\n  {\n    // Required fields based on: ${typeDescription}\n    // TODO: Fill in actual pattern based on type description\n  },\n  {\n    // Optional fields\n  }\n);\nharden(${patternName});`,
        typedef: includeJsdoc
          ? `/**\n * @typedef {{\n *   // TODO: Generate from ${typeDescription}\n * }} ${patternName.replace('Shape', '')}\n */`
          : undefined,
        imports_needed: ["import { M } from '@endo/patterns';"],
        usage: `mustMatch(data, ${patternName});`,
        note: 'This is a template. Parse typeDescription to generate actual pattern fields.',
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
    'agoric_error_handling',
    'Guide to using @endo/errors properly in Agoric contracts. Covers Fail, makeError, q() usage patterns and best practices.',
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
          import_statement: errorHandlingData.import_statement,
          functions: errorHandlingData.functions,
        };
      } else {
        response = errorHandlingData;
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
