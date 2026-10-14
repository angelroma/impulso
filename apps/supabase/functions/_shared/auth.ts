import type { User } from "@supabase/supabase-js";
import { ApiError } from "./http.ts";

export interface VerifiedIdentity {
  readonly user_id: string;
  readonly session_id: string;
  readonly email: string | null;
  readonly google_authenticated?: boolean;
  readonly oauth_client_id?: string;
  readonly oauth_scopes?: readonly string[];
}

export interface AuthDependencies {
  readonly issuer: string;
  readonly getUser: (token: string) => Promise<{
    user: User | null;
    error: { status?: number } | null;
  }>;
  readonly hasActiveSession: (identity: VerifiedIdentity) => Promise<boolean>;
  readonly now?: () => number;
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function unauthorized(): ApiError {
  return new ApiError(401, "invalid_session", "A valid signed-in user session is required.");
}

export function bearerUserToken(request: Request): string {
  const header = request.headers.get("authorization") ?? "";
  if (header.length > 16_384) throw unauthorized();
  const match = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i.exec(header);
  if (!match) throw unauthorized();
  return match[1];
}

function decodeClaims(token: string): Record<string, unknown> {
  try {
    const payload = token.split(".")[1].replaceAll("-", "+").replaceAll("_", "/");
    const padded = payload.padEnd(Math.ceil(payload.length / 4) * 4, "=");
    const bytes = Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
    const claims = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (claims === null || typeof claims !== "object" || Array.isArray(claims)) {
      throw unauthorized();
    }
    return claims;
  } catch {
    throw unauthorized();
  }
}

export function createAuthenticator(dependencies: AuthDependencies) {
  return async (request: Request): Promise<VerifiedIdentity> => {
    const token = bearerUserToken(request);
    // Auth verifies the signature; decoded claims alone never establish identity.
    const { user, error } = await dependencies.getUser(token);
    if (error) {
      if (error.status !== undefined && [400, 401, 403, 422].includes(error.status)) {
        throw unauthorized();
      }
      throw new ApiError(503, "auth_unavailable", "Authentication is temporarily unavailable.");
    }
    if (!user || !isUuid(user.id)) throw unauthorized();
    const claims = decodeClaims(token);
    const now = Math.floor((dependencies.now?.() ?? Date.now()) / 1000);
    const audience = claims.aud;
    if (
      claims.iss !== dependencies.issuer ||
      !(audience === "authenticated" ||
        (Array.isArray(audience) && audience.includes("authenticated"))) ||
      claims.role !== "authenticated" ||
      !isUuid(claims.sub) || claims.sub.toLowerCase() !== user.id.toLowerCase() ||
      !isUuid(claims.session_id) ||
      !Number.isSafeInteger(claims.exp) || (claims.exp as number) <= now ||
      (claims.nbf !== undefined &&
        (!Number.isSafeInteger(claims.nbf) || (claims.nbf as number) > now))
    ) throw unauthorized();
    if (user.is_anonymous || claims.is_anonymous === true) {
      throw new ApiError(
        403,
        "anonymous_user_not_allowed",
        "A registered user account is required.",
      );
    }
    const oauthClientId = claims.client_id;
    const oauthScopes = typeof claims.scope === "string"
      ? claims.scope.split(" ").filter(Boolean)
      : [];
    const authenticationMethods = Array.isArray(claims.amr) ? claims.amr : [];
    const delegatedOAuth = oauthClientId !== undefined && oauthClientId !== "";
    if (
      delegatedOAuth &&
      (!isUuid(oauthClientId) || oauthScopes.length === 0 ||
        oauthScopes.some((scope) =>
          !["openid", "email", "profile", "phone", "offline_access"].includes(scope)
        ) ||
        !authenticationMethods.some((method) =>
          method !== null && typeof method === "object" &&
          method.method === "oauth_provider/authorization_code"
        ))
    ) throw unauthorized();
    const identity = Object.freeze({
      user_id: user.id,
      session_id: claims.session_id,
      email: user.email ?? null,
      // Delegated OAuth sessions do not retain the original Google sign-in AMR. For those
      // sessions this flag means a confirmed, server-verified Google-linked account.
      // Direct sessions still require external OAuth, with Google as the sole provider.
      google_authenticated: Boolean(
        user.email_confirmed_at &&
          user.identities?.some((identity) => identity.provider === "google") &&
          (delegatedOAuth ||
            authenticationMethods.some((method) =>
              method !== null && typeof method === "object" && method.method === "oauth"
            )),
      ),
      ...(delegatedOAuth
        ? { oauth_client_id: oauthClientId as string, oauth_scopes: Object.freeze(oauthScopes) }
        : {}),
    });
    if (!await dependencies.hasActiveSession(identity)) throw unauthorized();
    return identity;
  };
}
