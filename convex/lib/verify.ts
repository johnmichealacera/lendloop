import { hmacSha256Hex } from "./hmac";

export const MAX_SKEW_SECONDS = 300;

/**
 * What n8n signs when calling Convex. Method and path are included because GET requests have no body:
 * without them, one captured signature could be replayed against a different endpoint.
 */
export function canonicalRequest(timestamp: string, method: string, path: string, body: string): string {
  return `${timestamp}.${method.toUpperCase()} ${path}.${body}`;
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export type Verified = { ok: true; body: string } | { ok: false; status: 401 | 503 };

export async function verifyN8nRequest(req: Request, secret: string | undefined, now = Date.now()): Promise<Verified> {
  if (!secret) return { ok: false, status: 503 };
  const timestamp = req.headers.get("X-LendLoop-Timestamp") ?? "";
  const signature = req.headers.get("X-LendLoop-Signature") ?? "";
  if (!/^\d+$/.test(timestamp) || Math.abs(now / 1000 - Number(timestamp)) > MAX_SKEW_SECONDS) {
    return { ok: false, status: 401 };
  }
  const body = await req.text();
  const path = new URL(req.url).pathname;
  const expected = `sha256=${await hmacSha256Hex(secret, canonicalRequest(timestamp, req.method, path, body))}`;
  return constantTimeEqual(signature, expected) ? { ok: true, body } : { ok: false, status: 401 };
}
