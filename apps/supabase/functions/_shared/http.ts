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

export async function readJsonObject(
  request: Request,
  allowedFields: readonly string[],
  maxBytes = 32_768,
): Promise<Record<string, unknown>> {
  if (!/^application\/json(?:\s*;.*)?$/i.test(request.headers.get("content-type") ?? "")) {
    throw new ApiError(415, "unsupported_media_type", "Content-Type must be application/json.");
  }
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null && !/^\d+$/.test(declaredLength)) {
    throw new ApiError(400, "invalid_body", "The request body is invalid.");
  }
  if (declaredLength !== null && Number(declaredLength) > maxBytes) {
    throw new ApiError(413, "body_too_large", "The request body exceeds the allowed size.");
  }
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, "invalid_body", "A JSON object is required.");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) {
        await reader.cancel();
        throw new ApiError(413, "body_too_large", "The request body exceeds the allowed size.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new ApiError(400, "invalid_body", "A valid JSON object is required.");
  }
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new ApiError(400, "invalid_body", "A JSON object is required.");
  }
  if (Object.keys(body).some((field) => !allowedFields.includes(field))) {
    throw new ApiError(400, "unknown_field", "The request contains an unsupported field.");
  }
  return body as Record<string, unknown>;
}
