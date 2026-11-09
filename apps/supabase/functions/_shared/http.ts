export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function jsonResponse(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
}

export function errorResponse(error: unknown): Response {
  if (!(error instanceof ApiError)) {
    const code = error !== null && typeof error === "object" && "code" in error
      ? String(error.code)
      : "unknown";
    // Log a bounded code only; error messages can contain SQL, credentials or personal data.
    console.error("Unhandled request error", {
      code: /^[A-Za-z0-9_]{1,40}$/.test(code) ? code : "unknown",
      name: error instanceof Error ? error.name : "unknown",
    });
  }
  const safeError = error instanceof ApiError
    ? error
    : new ApiError(500, "internal_error", "The request could not be completed.");
  return jsonResponse(
    { error: { code: safeError.code, message: safeError.message } },
    safeError.status,
    safeError.status === 401 ? { "WWW-Authenticate": "Bearer" } : {},
  );
}
