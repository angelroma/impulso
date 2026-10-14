import { createHandler } from "./handler.ts";
import {
  allowedBrowserOrigins,
  createRuntimeAuthenticator,
  createRuntimeFinance,
  createRuntimeOnboarding,
  createRuntimeOnboardingStatus,
  mcpConfiguration,
} from "./runtime.ts";

Deno.serve(createHandler({
  ...createRuntimeFinance(),
  authenticate: createRuntimeAuthenticator(),
  onboard: createRuntimeOnboarding(),
  onboardingStatus: createRuntimeOnboardingStatus(),
  allowedOrigins: allowedBrowserOrigins(),
  mcp: mcpConfiguration(),
}));
