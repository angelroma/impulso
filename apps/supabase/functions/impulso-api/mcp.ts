import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { VerifiedIdentity } from "../_shared/auth.ts";
import { ApiError, errorResponse, jsonResponse } from "../_shared/http.ts";
import { FINANCE_TOOLS, type FinanceToolName } from "../_shared/finance_contracts.ts";

export interface McpConfiguration {
  readonly resourceUrl: string;
  readonly authorizationServer: string;
}

export interface McpDependencies {
  readonly runFinance?: (
    identity: VerifiedIdentity,
    name: FinanceToolName,
    input: unknown,
  ) => Promise<Record<string, unknown>>;
}

const INSTRUCTIONS = [
  "Call get_context before the first action and reuse its ids; call it again after changing workspace.",
  "If setup_required is true, ask only for a workspace name (suggest Personal) and its currency, " +
  "use the time zone the client already knows or ask for the city, then call manage_workspace create.",
  "Be brief: reply in the user's language in one or two lines. Do not show reviews or ask for " +
  "confirmation when the request is clear; act and report the result in one line (amount, payee, " +
  "category, account, new balance).",
  "When something is missing or ambiguous, ask one short question and offer the matching options " +
  "from get_context as a short numbered list (or the client's choice buttons). Never explain internals.",
  "Amounts are decimal strings. Use the workspace currency; never convert or guess another one.",
  "Use a new UUID request_id for each new transaction and reuse it only to retry that same one.",
  "Pass the payee name as the user said it. Omit category_id to use the payee's default category. " +
  "When a new payee gets a category, save it as that payee's default with manage_payee update.",
  "Never send tokens, passwords or SQL as tool input.",
].join("\n");

export function protectedResourceMetadata(configuration: McpConfiguration): Response {
  return jsonResponse({
    resource: configuration.resourceUrl,
    resource_name: "Impulso",
    authorization_servers: [configuration.authorizationServer],
    bearer_methods_supported: ["header"],
    // Supabase OIDC scopes describe identity data, not application permissions.
    scopes_supported: ["openid", "email", "profile", "offline_access"],
  });
}

export function mcpChallenge(configuration: McpConfiguration, insufficientScope = false): string {
  const metadata = configuration.resourceUrl.replace(
    /\/mcp$/,
    "/.well-known/oauth-protected-resource",
  );
  return `Bearer resource_metadata="${metadata}", scope="openid"` +
    (insufficientScope ? ', error="insufficient_scope"' : "");
}

export function requireMcpIdentity(identity: VerifiedIdentity): void {
  if (!identity.oauth_client_id) {
    throw new ApiError(401, "oauth_required", "Connect this client using Impulso OAuth.");
  }
  if (!identity.oauth_scopes?.includes("openid")) {
    throw new ApiError(403, "insufficient_scope", "The openid identity scope is required.");
  }
  if (!identity.google_authenticated) {
    throw new ApiError(
      403,
      "google_sign_in_required",
      "A verified Google-linked account is required.",
    );
  }
}

async function toolResult(operation: () => Promise<Record<string, unknown>>) {
  try {
    const result = await operation();
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result) }],
      structuredContent: result,
    };
  } catch (error) {
    const response = errorResponse(error);
    const result = await response.json();
    return { content: [{ type: "text" as const, text: JSON.stringify(result) }], isError: true };
  }
}

export async function handleMcpRequest(
  request: Request,
  identity: VerifiedIdentity,
  dependencies: McpDependencies,
): Promise<Response> {
  requireMcpIdentity(identity);
  // Each request has its own server and verified identity. No cross-client memory or transport state.
  const server = new McpServer(
    { name: "Impulso", version: "0.2.0" },
    { instructions: INSTRUCTIONS },
  );
  for (const name of Object.keys(FINANCE_TOOLS) as FinanceToolName[]) {
    const tool = FINANCE_TOOLS[name];
    server.registerTool(name, {
      title: tool.title,
      description: tool.description,
      inputSchema: tool.input,
      annotations: {
        readOnlyHint: tool.readOnly,
        destructiveHint: name === "update_transaction" || name.startsWith("manage_"),
        idempotentHint: tool.readOnly || name === "record_transaction",
        openWorldHint: false,
      },
    }, (input: unknown) =>
      toolResult(() => {
        if (!dependencies.runFinance) {
          throw new ApiError(503, "service_unavailable", "The service is not configured.");
        }
        return dependencies.runFinance(identity, name, input);
      }));
  }

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
    maxRequestBodySize: 32_768,
  });
  try {
    await server.connect(transport);
    return await transport.handleRequest(request);
  } finally {
    await server.close();
  }
}
