export interface AuthorizationAssets {
  html: string;
  script: string;
  styles: string;
}

export interface AuthorizationConfiguration {
  apiUrl: string;
  publicKey: string;
}

export function authorizationConfiguration(
  issuer: string,
  publicKey: string,
): AuthorizationConfiguration {
  const url = new URL(issuer);
  if (
    url.href !== issuer || url.pathname !== "/auth/v1" || url.search || url.hash ||
    url.username || url.password ||
    (url.protocol !== "https:" &&
      !(url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname)))
  ) throw new Error("The authorization function requires a canonical public Auth issuer.");

  let isPublic = /^sb_publishable_[A-Za-z0-9_-]+$/.test(publicKey);
  if (!isPublic && publicKey.length <= 8192) {
    try {
      const parts = publicKey.split(".");
      if (parts.length === 3 && parts.every((part) => /^[A-Za-z0-9_-]+$/.test(part))) {
        const payload = JSON.parse(atob(parts[1].replaceAll("-", "+").replaceAll("_", "/")));
        isPublic = payload.role === "anon";
      }
    } catch { /* Malformed or privileged credentials must never reach the browser. */ }
  }
  if (!isPublic) throw new Error("The authorization function requires a public API key.");
  return { apiUrl: url.origin, publicKey };
}

export function createAuthorizationHandler(
  configuration: AuthorizationConfiguration,
  assets: AuthorizationAssets,
): (request: Request) => Response {
  // Validate configuration once; request and proxy headers never select the Auth server.
  const verified = authorizationConfiguration(
    `${configuration.apiUrl}/auth/v1`,
    configuration.publicKey,
  );
  const files = new Map<string, readonly [string, string]>([
    ["", ["text/html; charset=utf-8", assets.html]],
    ["/", ["text/html; charset=utf-8", assets.html]],
    ["/oauth/consent", ["text/html; charset=utf-8", assets.html]],
    ["/auth/callback", ["text/html; charset=utf-8", assets.html]],
    ["/auth.js", ["application/javascript; charset=utf-8", assets.script]],
    ["/styles.css", ["text/css; charset=utf-8", assets.styles]],
    ["/config.json", [
      "application/json; charset=utf-8",
      JSON.stringify({ api_url: verified.apiUrl, public_key: verified.publicKey }),
    ]],
  ]);
  const securityHeaders = {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Frame-Options": "DENY",
    "Content-Security-Policy":
      `default-src 'none'; script-src 'self'; style-src 'self'; connect-src ${verified.apiUrl}; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`,
  };

  return (request: Request): Response => {
    const pathname = new URL(request.url).pathname;
    // The local gateway strips /functions/v1 before forwarding to the Edge Runtime.
    const prefix = ["/functions/v1/impulso-auth", "/impulso-auth"].find((candidate) =>
      pathname === candidate || pathname.startsWith(`${candidate}/`)
    );
    const file = prefix ? files.get(pathname.slice(prefix.length)) : undefined;
    const head = request.method === "HEAD";
    if (!file) {
      return new Response(head ? null : "Not found.", {
        status: 404,
        headers: { ...securityHeaders, "Content-Type": "text/plain; charset=utf-8" },
      });
    }
    if (request.method !== "GET" && !head) {
      return new Response("Method not allowed.", {
        status: 405,
        headers: {
          ...securityHeaders,
          "Content-Type": "text/plain; charset=utf-8",
          "Allow": "GET, HEAD",
        },
      });
    }
    return new Response(head ? null : file[1], {
      headers: { ...securityHeaders, "Content-Type": file[0] },
    });
  };
}
