import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

const scaffoldInstructions = {
  overview: 'Instructions for setting up an Agoric smart contract project based on the official hello-world template.',
  repository: {
    git_url: 'git@github.com:Agoric/agoric-hello-world.git',
    https_url: 'https://github.com/Agoric/agoric-hello-world.git',
    zip_url: 'https://github.com/Agoric/agoric-hello-world/archive/refs/heads/main.zip',
  },
  scenarios: {
    empty_folder: {
      description: 'Current folder is empty - starting fresh',
      recommended_approach: 'git clone',
      steps: [
        '1. Clone the repository directly into the current folder:',
        '   git clone git@github.com:Agoric/agoric-hello-world.git .',
        '   OR if SSH is not configured:',
        '   git clone https://github.com/Agoric/agoric-hello-world.git .',
        '2. Install dependencies: yarn install',
        '3. Optionally remove .git folder and reinitialize: rm -rf .git && git init',
        '4. Update package.json with the desired project name',
      ],
      commands: {
        clone_ssh: 'git clone git@github.com:Agoric/agoric-hello-world.git .',
        clone_https: 'https://github.com/Agoric/agoric-hello-world.git .',
        install: 'yarn install',
        reinit_git: 'rm -rf .git && git init',
      },
    },
    existing_code: {
      description: 'Current folder has existing code - need to merge template files',
      recommended_approach: 'download zip to temp folder and selectively copy',
      steps: [
        '1. Create a temporary directory for the template',
        '2. Download and extract the template:',
        '   curl -L https://github.com/Agoric/agoric-hello-world/archive/refs/heads/main.zip -o /tmp/agoric-template.zip',
        '   unzip /tmp/agoric-template.zip -d /tmp/agoric-template',
        '3. The template will be in /tmp/agoric-template/agoric-hello-world-main/',
        '4. Review and selectively copy needed files WITHOUT overwriting user code:',
        '   - Copy config files if missing: tsconfig.json, .eslintrc.cjs, ava.config.js',
        '   - Merge package.json dependencies (do NOT overwrite, merge dependencies)',
        '   - Copy contract structure from src/ if user needs reference',
        '   - Copy test setup from test/ if missing',
        '5. Clean up temp files: rm -rf /tmp/agoric-template.zip /tmp/agoric-template',
      ],
      commands: {
        download: 'curl -L https://github.com/Agoric/agoric-hello-world/archive/refs/heads/main.zip -o /tmp/agoric-template.zip',
        extract: 'unzip /tmp/agoric-template.zip -d /tmp/agoric-template',
        template_path: '/tmp/agoric-template/agoric-hello-world-main/',
        cleanup: 'rm -rf /tmp/agoric-template.zip /tmp/agoric-template',
      },
      files_to_copy_if_missing: [
        'tsconfig.json - TypeScript configuration',
        '.eslintrc.cjs - ESLint configuration for SES compatibility',
        'ava.config.js - AVA test configuration',
        'typedoc.json - TypeDoc configuration (optional)',
        '.github/ - GitHub Actions workflows (optional)',
      ],
      files_to_merge: [
        'package.json - Merge dependencies and scripts, do NOT overwrite name/version',
      ],
      files_to_use_as_reference: [
        'src/contract.js - Example contract structure',
        'src/flows.js - Example orchestration flows',
        'test/ - Test file structure and patterns',
      ],
    },
  },
  important_notes: [
    'NEVER overwrite user code without explicit permission',
    'When merging package.json, preserve user project name and version',
    'The hello-world template uses orchestration patterns - simplify if user needs basic Zoe contract',
    'Always run yarn install after modifying package.json',
    'Check for conflicts in tsconfig.json if user has custom TypeScript setup',
  ],
  template_structure: {
    'src/': 'Smart contract source code',
    'src/contract.js': 'Main contract entry point with start function',
    'src/flows.js': 'Orchestration flows (async operations)',
    'test/': 'Test files using AVA',
    'package.json': 'Dependencies and scripts',
    'tsconfig.json': 'TypeScript configuration',
    '.eslintrc.cjs': 'ESLint rules for SES/Agoric',
    'ava.config.js': 'AVA test runner configuration',
  },
};

export const registerProjectSetupTools = (server: McpServer) => {
  server.tool(
    'agoric_project_scaffold',
    'Get instructions for scaffolding an Agoric smart contract project. Returns setup steps based on whether the folder is empty or has existing code.',
    {
      folderState: z
        .enum(['empty', 'has_existing_code', 'unknown'])
        .default('unknown')
        .describe('Whether the current folder is empty or has existing code'),
      projectName: z.string().optional().describe('Name of the project (for package.json)'),
    },
    async ({ folderState, projectName }) => {
      let response: Record<string, unknown>;

      if (folderState === 'empty') {
        response = {
          scenario: 'empty_folder',
          project_name: projectName || 'my-agoric-contract',
          instructions: scaffoldInstructions.scenarios.empty_folder,
          repository: scaffoldInstructions.repository,
          template_structure: scaffoldInstructions.template_structure,
          next_steps: [
            'After cloning, update package.json with your project name',
            'Run yarn install to install dependencies',
            'Explore src/contract.js and src/flows.js to understand the structure',
            'Run yarn test to verify setup',
          ],
        };
      } else if (folderState === 'has_existing_code') {
        response = {
          scenario: 'existing_code',
          project_name: projectName,
          instructions: scaffoldInstructions.scenarios.existing_code,
          repository: scaffoldInstructions.repository,
          important_notes: scaffoldInstructions.important_notes,
          template_structure: scaffoldInstructions.template_structure,
          merge_strategy: {
            config_files: 'Copy if missing, do not overwrite existing',
            package_json: 'Merge dependencies only, preserve user metadata',
            source_code: 'Use as reference only, never overwrite user code',
            tests: 'Copy test setup files if missing, preserve user tests',
          },
        };
      } else {
        // Unknown - provide both scenarios
        response = {
          scenario: 'unknown',
          instructions: 'First determine if the current folder is empty or has existing code',
          check_command: 'ls -la',
          scenarios: scaffoldInstructions.scenarios,
          repository: scaffoldInstructions.repository,
          important_notes: scaffoldInstructions.important_notes,
          template_structure: scaffoldInstructions.template_structure,
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
    'agoric_dependencies',
    'Get current recommended dependencies for Agoric smart contract development. Returns package.json dependencies and devDependencies with pinned versions.',
    {
      sdkVersion: z
        .string()
        .optional()
        .describe('Agoric SDK version (defaults to latest stable u22.2)'),
      includeOrchestration: z
        .boolean()
        .default(true)
        .describe('Include orchestration-related dependencies'),
      includeTestDeps: z
        .boolean()
        .default(true)
        .describe('Include test dependencies (AVA, etc.)'),
    },
    async ({ sdkVersion, includeOrchestration, includeTestDeps }) => {
      const version = sdkVersion || 'u22.2';

      // Core dependencies always needed
      const dependencies: Record<string, string> = {
        '@agoric/ertp': `^0.17.0-${version}`,
        '@agoric/internal': `^0.4.0-${version}`,
        '@agoric/store': `^0.10.0-${version}`,
        '@agoric/vat-data': `^0.6.0-${version}`,
        '@agoric/vow': `^0.2.0-${version}`,
        '@agoric/zoe': `^0.27.0-${version}`,
        '@endo/errors': '^1.2.13',
        '@endo/far': '^1.1.14',
        '@endo/init': '^1.1.12',
        '@endo/marshal': '^1.8.0',
        '@endo/patterns': '^1.7.0',
      };

      // Orchestration dependencies
      if (includeOrchestration) {
        dependencies['@agoric/orchestration'] = `^0.2.0-${version}`;
        dependencies['@agoric/notifier'] = `^0.7.0-${version}`;
      }

      // Dev dependencies
      const devDependencies: Record<string, string> = {};
      if (includeTestDeps) {
        devDependencies['@agoric/swingset-liveslots'] = `^0.11.0-${version}`;
        devDependencies['@agoric/vats'] = `^0.16.0-${version}`;
        devDependencies['@agoric/zone'] = `^0.3.0-${version}`;
        devDependencies['@agoric/network'] = `^0.2.0-${version}`;
        devDependencies['ava'] = '^5.3.0';
        devDependencies['c8'] = '^10.1.3';
        devDependencies['ts-blank-space'] = '^0.6.2';
        devDependencies['bech32'] = '^2.0.0';
      }

      const scripts = {
        build: 'exit 0',
        test: 'ava',
        'test:c8': 'c8 --all ${C8_OPTIONS:-} ava',
        lint: "yarn run -T run-s --continue-on-error 'lint:*'",
        'lint-fix': 'yarn lint:eslint --fix',
        'lint:eslint': 'yarn run -T eslint .',
        'lint:types': 'yarn run -T tsc',
      };

      const response = {
        sdk_version: version,
        dependencies,
        devDependencies: includeTestDeps ? devDependencies : undefined,
        scripts,
        resolutions: {
          'bech32': '^2.0.0',
        },
        engines: {
          node: '^20.9 || ^22.11',
        },
        notes: [
          'Dependencies are pinned to specific SDK version for compatibility',
          'Use yarn resolutions to ensure consistent bech32 version',
          'Node 20.9+ or 22.11+ is required for SES compatibility',
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
    'agoric_eslint_config',
    'Get ESLint configuration optimized for Agoric smart contract development. Includes rules for SES compatibility and Agoric best practices.',
    {
      includeTypescript: z
        .boolean()
        .default(true)
        .describe('Include TypeScript ESLint rules'),
      detailLevel: z
        .enum(['quick', 'comprehensive'])
        .default('comprehensive')
        .describe('Level of detail in the response'),
    },
    async ({ includeTypescript, detailLevel }) => {
      const eslintConfig = {
        extends: ['@agoric'],
        rules: {
          // SES compatibility rules
          'no-eval': 'error',
          'no-new-func': 'error',
          'no-restricted-globals': [
            'error',
            'eval',
            'Function',
            'setTimeout',
            'setInterval',
          ],

          // Agoric best practices
          'no-restricted-syntax': [
            'error',
            {
              selector: "CallExpression[callee.property.name='push']",
              message:
                'Array.push() mutates arrays. Use spread: arr = [...arr, item]',
            },
          ],

          // Import rules
          'import/no-extraneous-dependencies': 'error',
        },
      };

      const typescriptRules = includeTypescript
        ? {
            overrides: [
              {
                files: ['**/*.ts'],
                extends: ['@agoric/eslint-config/typescript'],
                rules: {
                  '@typescript-eslint/no-floating-promises': 'error',
                  '@typescript-eslint/explicit-function-return-type': 'off',
                },
              },
            ],
          }
        : {};

      const response: Record<string, unknown> =
        detailLevel === 'quick'
          ? {
              extends: ['@agoric'],
              file: '.eslintrc.cjs',
              setup: 'Add @agoric/eslint-config to devDependencies',
            }
          : {
              config: { ...eslintConfig, ...typescriptRules },
              file: '.eslintrc.cjs',
              format: 'module.exports = { ... }',
              required_packages: [
                '@agoric/eslint-config',
                'eslint',
                ...(includeTypescript
                  ? ['@typescript-eslint/eslint-plugin', '@typescript-eslint/parser']
                  : []),
              ],
              ses_restrictions: [
                'No eval() or Function() constructor',
                'No direct array mutation (push, pop, splice)',
                'No global object modification',
                'No __proto__ assignment',
                'Date.now() and Math.random() return NaN in SES',
              ],
              best_practices: [
                'Always harden objects before export',
                'Use @endo/errors for error handling',
                'Validate inputs with @endo/patterns',
                'Replace array.push() with spread operator',
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
    'agoric_ava_config',
    'Get AVA test configuration for Agoric contracts. Includes SES lockdown requirements and recommended settings.',
    {
      useTypescript: z
        .boolean()
        .default(true)
        .describe('Configure for TypeScript tests'),
      detailLevel: z
        .enum(['quick', 'comprehensive'])
        .default('comprehensive')
        .describe('Level of detail in the response'),
    },
    async ({ useTypescript, detailLevel }) => {
      // AVA config that goes in package.json under "ava" key
      const avaConfig = {
        extensions: {
          js: true,
          ...(useTypescript ? { ts: 'module' } : {}),
        },
        files: ['test/**/*.test.*'],
        nodeArguments: [
          ...(useTypescript ? ['--import=ts-blank-space/register'] : []),
          '--no-warnings',
        ],
        require: ['@endo/init/debug.js'],
        timeout: '5m',
      };

      const testBoilerplate = `// @ts-check
import { test } from '@agoric/zoe/tools/prepare-test-env-ava.js';
import { makeTracer } from '@agoric/internal';

const trace = makeTracer('Test');

test('basic test', async t => {
  trace('Running test');
  t.pass();
});`;

      const supportFileExample = `// test/supports.js
import { makeDurableZone } from '@agoric/zone/durable.js';
import { makeHeapZone } from '@agoric/zone';

/**
 * Provide a zone for unit tests
 * Use HeapZone for simple tests, DurableZone for upgrade tests
 */
export const provideDurableZone = () => {
  // For unit tests, HeapZone is simpler
  return makeHeapZone();
};`;

      const response: Record<string, unknown> =
        detailLevel === 'quick'
          ? {
              config_location: 'package.json under "ava" key',
              ava: avaConfig,
              critical: '@endo/init/debug.js MUST be in require array',
            }
          : {
              config_location: 'package.json under "ava" key',
              ava: avaConfig,
              test_file_boilerplate: testBoilerplate,
              support_file_example: supportFileExample,
              critical_settings: {
                '@endo/init/debug.js':
                  'REQUIRED - Initializes SES lockdown before tests run',
                timeout:
                  'Set to 5m or higher for orchestration tests which can be slow',
                'ts-blank-space':
                  'Used for TypeScript - strips types without compilation',
              },
              test_commands: {
                all: 'yarn test',
                single: 'yarn ava test/my-test.test.js',
                coverage: 'yarn test:c8',
                watch: 'yarn ava --watch',
              },
              test_patterns: {
                unit_test:
                  'Test pure functions and utilities with makeHeapZone()',
                integration_test:
                  'Use @agoric/zoe/tools/setup-zoe.js for full Zoe tests',
                exo_test: 'Use zone.exoClassKit with provideDurableZone()',
              },
              important_notes: [
                'AVA config is in package.json, not a separate file',
                'SES lockdown happens via @endo/init/debug.js require',
                'Use ts-blank-space for TypeScript (faster than ts-node)',
                'Test files must match pattern: test/**/*.test.*',
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
};
