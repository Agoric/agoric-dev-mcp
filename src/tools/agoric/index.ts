import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerContractStructureTools } from './contract-structure';
import { registerCorePatternTools } from './core-patterns';
import { registerDebuggingTools } from './debugging';
import { registerDiscoveryTools } from './discovery';
import { registerDurabilityTools } from './durability';
import { registerOrchestrationTools } from './orchestration';
import { registerProjectSetupTools } from './project-setup';
import { registerSecurityTools } from './security';
import { registerTestingTools } from './testing';
import { registerZoeERTPTools } from './zoe-ertp';

export const registerAgoricTools = (server: McpServer) => {
  // Category 1: Project Setup
  registerProjectSetupTools(server);

  // Category 2: Core Patterns
  registerCorePatternTools(server);

  // Category 3: Contract Structure
  registerContractStructureTools(server);

  // Category 4: Zoe & ERTP
  registerZoeERTPTools(server);

  // Category 5: Orchestration
  registerOrchestrationTools(server);

  // Category 6: Durability
  registerDurabilityTools(server);

  // Category 7: Testing
  registerTestingTools(server);

  // Category 8: Debugging & Tracing
  registerDebuggingTools(server);

  // Category 9: Security
  registerSecurityTools(server);

  // Category 10: Discovery & Help
  registerDiscoveryTools(server);
};
