const encoder = new TextEncoder();

/** HMAC-SHA256 of `message` as lowercase hex, via Web Crypto (works in the default Convex runtime). */
export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return Array.from(new Uint8Array(signature), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Signature scheme shared with n8n: sha256=HMAC(secret, "<unix seconds>.<raw body>"). */
export async function signBody(secret: string, timestamp: string, body: string): Promise<string> {
  return `sha256=${await hmacSha256Hex(secret, `${timestamp}.${body}`)}`;
}
