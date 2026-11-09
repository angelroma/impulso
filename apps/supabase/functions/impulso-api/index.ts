import { createHandler } from "./handler.ts";
import {
  allowedBrowserOrigins,
  createRuntimeAuthenticator,
  createRuntimeFinance,
  mcpConfiguration,
} from "./runtime.ts";

Deno.serve(createHandler({
  authenticate: createRuntimeAuthenticator(),
  runFinance: createRuntimeFinance(),
  allowedOrigins: allowedBrowserOrigins(),
  mcp: mcpConfiguration(),
}));
