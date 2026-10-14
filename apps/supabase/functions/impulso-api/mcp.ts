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
    instructions: [
      "Use get_session before the first Impulso action. Guide setup only when onboarding.status is " +
      "required. If complete, skip initial setup; if unavailable, explain that setup is unavailable " +
      "and do not call onboard. Retain the user's original request without claiming it is complete.",
      "A workspace organizes the user's data. If its name is missing, offer exactly these three " +
      "numbered suggestions: 1. Orbit (recommended), 2. Momentum, 3. Launchpad. Also allow a custom " +
      "name. Accept a name, its displayed number, or the recommended choice without requiring the " +
      "user to invent or retype a name. Selecting a name alone does not authorize creation. Ask " +
      "for a display name only when missing. Preserve user-provided names and their language; " +
      "never infer a display name from email or assume profile details that were not supplied.",
      "Suggest a time zone using the user's explicit preference or an unambiguous stated city and " +
      "country first, otherwise a valid time-zone hint actually available in the current client " +
      "context. A hint is a suggestion, not proof of residence. The backend does not know the user's " +
      "location. Never infer it from email, language, IP address, the execution host, or server region, " +
      "and never silently default to UTC or assume another client's context is available.",
      "Describe the proposed time zone with a familiar city or regional label, such as Mexico City " +
      "time, and offer to continue or change it. Accept a different city or region in everyday " +
      "language; do not require the user to type an IANA identifier. If context is missing, ask for " +
      "a city and any necessary country or region. Clarify ambiguous cities, multi-zone countries, " +
      "fixed offsets, or uncertain mappings, using a nearby major city if helpful. Resolve the " +
      "location to a named IANA zone internally only when confident; a correction overrides a hint.",
      "Once all values are resolved, show one concise review containing the display name, workspace " +
      "name, and city-based time zone, and ask the user to confirm whether to continue or change " +
      "anything. For example, after the name Alex is supplied and Mexico City time is available: " +
      "'I'll set up your profile as Alex, name your workspace Orbit, and use Mexico City time. " +
      "Would you like to continue or change anything? You can name another city if needed.' " +
      "These example values are not global defaults. Call onboard only after acceptance of the " +
      "complete review. Show a revised review after a correction. Cancellation performs no write. " +
      "Do not ask users to repeat accepted values or confirm each field separately.",
      "After acceptance, call onboard with only the confirmed display_name, workspace_name, canonical " +
      "IANA timezone, and a new UUID request_id. Preserve that UUID and the unchanged payload for an " +
      "identical retry. Check get_session after an uncertain result before submitting changed values; " +
      "a changed submission needs a fresh UUID and must not silently change an existing workspace.",
      "Never send tokens, passwords, SQL, actor IDs, raw client/location context, or financial or " +
      "health records as tool input. Contextual suggestions never establish identity or permissions. " +
      "Only account setup is currently available; Finance and Health writes are not implemented. " +
      "After setup, explain any unsupported original request instead of claiming it was saved.",
    ].join("\n\n"),
  });
  server.registerTool("get_session", {
    title: "Get Impulso session",
    description:
      "Read the connected user's identity and initial setup status before the first Impulso action. " +
      "If required, preserve supplied names and their language. Ask for a display name only when " +
      "missing; never derive it from email. If the workspace name is missing, offer Orbit " +
      "(recommended), Momentum, Launchpad, or a custom name. Suggest a city-based time zone from " +
      "available user/client context, clarify " +
      "missing or ambiguous locations, and review all values before creation. If complete, skip " +
      "initial setup; if unavailable, explain it without creating resources. This response contains " +
      "no display name, time-zone hint, or location; use only context actually available to the client.",
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
      "Create the connected user's personal workspace and self profile only after they accept a " +
      "complete review of display name, workspace name, and city-based time zone. Offer Orbit " +
      "(recommended), Momentum, Launchpad, or a custom name only when the workspace name is missing. " +
      "Preserve supplied names and their language; ask for a display name only when missing and " +
      "never derive it from email. Prefer explicit user " +
      "location/preferences over a real client time-zone hint; ask for a city/country when missing " +
      "or ambiguous. Resolve city corrections internally to a canonical IANA zone without requiring " +
      "the user to type it. Corrections need a revised review; cancellation performs no write. " +
      "Retry with the same request_id and unchanged values to avoid duplicates. Check get_session " +
      "after uncertain results before a changed submission, which needs a fresh request_id.",
    inputSchema: z.object({
      request_id: z.string().uuid().describe(
        "A UUID for this confirmed action; reuse it on retries.",
      ),
      display_name: z.string().min(1).max(400).describe("The display name confirmed by the user."),
      workspace_name: z.string().min(1).max(400).describe(
        "The workspace name confirmed by the user.",
      ),
      timezone: z.string().min(1).max(200).describe(
        "The canonical IANA time zone resolved from the city or region accepted in the complete " +
          "setup review. Resolve it for the user; do not submit a city label or fixed offset.",
      ),
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
