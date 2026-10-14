import { createHandler } from "./handler.ts";
import {
  allowedBrowserOrigins,
  createRuntimeAuthenticator,
  createRuntimeOnboarding,
  createRuntimeOnboardingStatus,
  mcpConfiguration,
} from "./runtime.ts";

Deno.serve(createHandler({
  authenticate: createRuntimeAuthenticator(),
  onboard: createRuntimeOnboarding(),
  onboardingStatus: createRuntimeOnboardingStatus(),
  allowedOrigins: allowedBrowserOrigins(),
  mcp: mcpConfiguration(),
}));
