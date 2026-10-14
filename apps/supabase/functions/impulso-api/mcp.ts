import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import type { VerifiedIdentity } from "../_shared/auth.ts";
import { ApiError, errorResponse, jsonResponse } from "../_shared/http.ts";
import {
  type OnboardingInput,
  type OnboardingResult,
  validateOnboardingInput,
} from "../_shared/onboarding.ts";

export interface McpConfiguration {
  readonly resourceUrl: string;
  readonly authorizationServer: string;
}

export interface OnboardingStatus {
  readonly status: "required" | "complete" | "unavailable";
  readonly workspace_id?: string;
  readonly person_id?: string;
}

export interface McpDependencies {
  readonly onboard?: (
    identity: VerifiedIdentity,
    input: OnboardingInput,
  ) => Promise<OnboardingResult>;
  readonly onboardingStatus?: (identity: VerifiedIdentity) => Promise<OnboardingStatus>;
}

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
  const server = new McpServer({ name: "Impulso", version: "0.1.0" }, {
    instructions:
      "Use get_session first. If onboarding is required, ask the user to confirm their display name, " +
      "workspace name and IANA time zone in the conversation. Then call onboard using a new UUID " +
      "request_id. Preserve that UUID when retrying the same confirmed request. Never invent user " +
      "preferences or send tokens, passwords, SQL, actor IDs, financial or health records as tool input. " +
      "Only account setup is available in this local version.",
  });
  server.registerTool("get_session", {
    title: "Get Impulso session",
    description:
      "Read the connected user's identity and whether initial account setup is required.",
    inputSchema: z.object({}).strict(),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, () =>
    toolResult(async () => ({
      user: {
        id: identity.user_id,
        ...(identity.oauth_scopes?.includes("email") ? { email: identity.email } : {}),
      },
      onboarding: dependencies.onboardingStatus
        ? await dependencies.onboardingStatus(identity)
        : { status: "unavailable" },
    })));
  server.registerTool("onboard", {
    title: "Set up Impulso account",
    description:
      "Create the connected user's personal workspace and self profile after they confirm these " +
      "values in the conversation. Retry with the same request_id and unchanged values to avoid duplicates.",
    inputSchema: z.object({
      request_id: z.string().uuid().describe(
        "A UUID for this confirmed action; reuse it on retries.",
      ),
      display_name: z.string().min(1).max(400).describe("The display name confirmed by the user."),
      workspace_name: z.string().min(1).max(400).describe(
        "The workspace name confirmed by the user.",
      ),
      timezone: z.string().min(1).max(200).describe("The user's confirmed IANA time zone."),
    }).strict(),
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, (input: Record<string, unknown>) =>
    toolResult(async () => {
      const validated = validateOnboardingInput(input);
      if (!dependencies.onboard) {
        throw new ApiError(503, "service_unavailable", "The service is not configured.");
      }
      return { ...await dependencies.onboard(identity, validated) };
    }));

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
