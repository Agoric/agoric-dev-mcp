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
        .describe('Agoric SDK version (defaults to latest stable)'),
      includeOrchestration: z
        .boolean()
        .default(false)
        .describe('Include orchestration-related dependencies'),
      includeTestDeps: z
        .boolean()
        .default(true)
        .describe('Include test dependencies (AVA, etc.)'),
    },
    async ({ sdkVersion, includeOrchestration, includeTestDeps }) => {
      // TODO: Implement dependency retrieval
      return {
        content: [
          {
            type: 'text',
            text: 'Recommended dependencies for Agoric development',
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
      // TODO: Implement ESLint config generation
      return {
        content: [
          {
            type: 'text',
            text: 'ESLint configuration for Agoric development',
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
        .default(false)
        .describe('Configure for TypeScript tests'),
      detailLevel: z
        .enum(['quick', 'comprehensive'])
        .default('comprehensive')
        .describe('Level of detail in the response'),
    },
    async ({ useTypescript, detailLevel }) => {
      // TODO: Implement AVA config generation
      return {
        content: [
          {
            type: 'text',
            text: 'AVA configuration for Agoric testing',
          },
        ],
      };
    },
  );
};
