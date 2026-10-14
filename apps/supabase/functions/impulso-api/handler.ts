import type { VerifiedIdentity } from "../_shared/auth.ts";
import { ApiError, errorResponse, jsonResponse, readJsonObject } from "../_shared/http.ts";
import {
  type OnboardingInput,
  type OnboardingResult,
  validateOnboardingInput,
} from "../_shared/onboarding.ts";
import {
  handleMcpRequest,
  mcpChallenge,
  type McpConfiguration,
  type OnboardingStatus,
  protectedResourceMetadata,
  requireMcpIdentity,
} from "./mcp.ts";

export interface HandlerDependencies {
  readonly authenticate: (request: Request) => Promise<VerifiedIdentity>;
  readonly onboard?: (
    identity: VerifiedIdentity,
    input: OnboardingInput,
  ) => Promise<OnboardingResult>;
  readonly allowedOrigins?: readonly string[];
  readonly mcp?: McpConfiguration;
  readonly onboardingStatus?: (identity: VerifiedIdentity) => Promise<OnboardingStatus>;
}

export function createHandler(dependencies: HandlerDependencies) {
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get("origin");
    const allowedOrigin = origin !== null && dependencies.allowedOrigins?.includes(origin);
    const url = new URL(request.url);
    const route = url.pathname.replace(/^(?:\/functions\/v1)?\/impulso-api(?=\/)/, "");
    function respond(response: Response): Response {
      response.headers.set("Vary", "Origin");
      if (allowedOrigin) response.headers.set("Access-Control-Allow-Origin", origin!);
      if (allowedOrigin) {
        response.headers.set("Access-Control-Expose-Headers", "WWW-Authenticate, Mcp-Session-Id");
      }
      response.headers.set("Cache-Control", "no-store");
      response.headers.set("X-Content-Type-Options", "nosniff");
      return response;
    }
    try {
      if (origin !== null && !allowedOrigin) {
        throw new ApiError(403, "origin_not_allowed", "This origin is not allowed.");
      }
      const metadataRoute = route === "/.well-known/oauth-protected-resource";
      const mcpRoute = route === "/mcp";
      if (
        route !== "/health" && route !== "/session" && route !== "/onboard" &&
        !(dependencies.mcp && (metadataRoute || mcpRoute))
      ) {
        throw new ApiError(404, "not_found", "The requested endpoint does not exist.");
      }
      const method = route === "/onboard" || mcpRoute ? "POST" : "GET";
      if (request.method === "OPTIONS") {
        const requestedHeaders = (request.headers.get("access-control-request-headers") ?? "")
          .toLowerCase().split(",").map((header) => header.trim()).filter(Boolean);
        if (
          !allowedOrigin || request.headers.get("access-control-request-method") !== method ||
          requestedHeaders.some((header) =>
            ![
              "authorization",
              "content-type",
              ...(mcpRoute ? ["accept", "mcp-protocol-version"] : []),
            ]
              .includes(header)
          )
        ) {
          throw new ApiError(403, "invalid_preflight", "This browser request is not allowed.");
        }
        return respond(
          new Response(null, {
            status: 204,
            headers: {
              "Access-Control-Allow-Methods": method,
              "Access-Control-Allow-Headers": mcpRoute
                ? "authorization, content-type, accept, mcp-protocol-version"
                : "authorization, content-type",
              "Cache-Control": "no-store",
            },
          }),
        );
      }
      if (request.method !== method && !(mcpRoute && request.method === "GET")) {
        return respond(jsonResponse(
          { error: { code: "method_not_allowed", message: `Only ${method} is supported.` } },
          405,
          { Allow: method },
        ));
      }
      if (url.search !== "") {
        throw new ApiError(400, "unsupported_query", "Query parameters are not supported.");
      }
      if (route === "/health") return respond(jsonResponse({ status: "ok", service: "Impulso" }));
      if (metadataRoute && dependencies.mcp) {
        return respond(protectedResourceMetadata(dependencies.mcp));
      }
      const identity = await dependencies.authenticate(request);
      if (mcpRoute) {
        requireMcpIdentity(identity);
        if (request.method === "GET") {
          return respond(jsonResponse(
            {
              error: {
                code: "method_not_allowed",
                message: "Use POST for this stateless MCP endpoint.",
              },
            },
            405,
            { Allow: "POST" },
          ));
        }
        return respond(await handleMcpRequest(request, identity, dependencies));
      }
      if (identity.oauth_client_id) {
        throw new ApiError(
          403,
          "oauth_route_not_allowed",
          "Use the MCP endpoint for this client connection.",
        );
      }
      if (route === "/onboard") {
        if (!identity.google_authenticated) {
          throw new ApiError(403, "google_sign_in_required", "Sign in with Google to continue.");
        }
        const input = validateOnboardingInput(
          await readJsonObject(request, [
            "request_id",
            "display_name",
            "workspace_name",
            "timezone",
          ]),
        );
        if (!dependencies.onboard) {
          throw new ApiError(503, "service_unavailable", "The service is not configured.");
        }
        return respond(jsonResponse(await dependencies.onboard(identity, input)));
      }
      return respond(jsonResponse({ user: { id: identity.user_id, email: identity.email } }));
    } catch (error) {
      const response = errorResponse(error);
      if (
        route === "/mcp" && dependencies.mcp &&
        (response.status === 401 ||
          (error instanceof ApiError && error.code === "insufficient_scope"))
      ) {
        response.headers.set(
          "WWW-Authenticate",
          mcpChallenge(dependencies.mcp, response.status === 403),
        );
      }
      return respond(response);
    }
  };
}
