import { Env, HttpError, Session, now, requireValue } from "./types";
const encoder = new TextEncoder();
export const hex = (data: ArrayBuffer) =>
  Array.from(new Uint8Array(data), (x) => x.toString(16).padStart(2, "0")).join(
    "",
  );
export const random = () =>
  hex(crypto.getRandomValues(new Uint8Array(32)).buffer);
export const hash = async (value: string) =>
  hex(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
export const b64 = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
export const challenge = async (verifier: string) =>
  b64(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", encoder.encode(verifier)),
    ),
  );
async function encryptionKey(env: Env) {
  requireValue(
    /^[a-f0-9]{64}$/i.test(env.SESSION_ENCRYPTION_KEY || ""),
    "Session encryption is not configured",
    503,
  );
  return crypto.subtle.importKey(
    "raw",
    Uint8Array.from(env.SESSION_ENCRYPTION_KEY.match(/../g)!, (x) =>
      parseInt(x, 16),
    ),
    "AES-GCM",
    false,
    ["encrypt", "decrypt"],
  );
}
export async function seal(env: Env, value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await encryptionKey(env),
    encoder.encode(value),
  );
  return b64(iv) + "." + b64(new Uint8Array(encrypted));
}
export async function unseal(env: Env, value: string) {
  const decode = (s: string) =>
    Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (x) =>
      x.charCodeAt(0),
    );
  const [iv, data] = value.split(".");
  return new TextDecoder().decode(
    await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: decode(iv) },
      await encryptionKey(env),
      decode(data),
    ),
  );
}
export async function session(request: Request, env: Env): Promise<Session> {
  const token = request.headers
    .get("Authorization")
    ?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
  requireValue(token, "Sign in with GitHub", 401);
  const row = await env.DB.prepare(
    "SELECT s.*,p.login FROM sessions s JOIN publishers p ON p.id=s.publisher_id WHERE token_hash=? AND expires_at>?",
  )
    .bind(await hash(token), now())
    .first<Session>();
  requireValue(row, "Session expired; sign in again", 401);
  return { ...row, github_token: await unseal(env, row.github_token) };
}
export function isAdmin(env: Env, id: number) {
  return env.ADMIN_IDS.split(",")
    .map((x) => x.trim())
    .includes(String(id));
}
export async function audit(
  env: Env,
  actor: string | number,
  action: string,
  subject: string,
) {
  await env.DB.prepare(
    "INSERT INTO audit(actor,action,subject,created_at) VALUES(?,?,?,?)",
  )
    .bind(String(actor), action, subject, now())
    .run();
  console.log(JSON.stringify({ event: action, subject }));
}
export async function service(request: Request, env: Env) {
  const value = request.headers.get("Authorization")?.replace(/^Bearer /, "");
  requireValue(
    env.VALIDATOR_TOKEN &&
      value &&
      (await hash(value)) === (await hash(env.VALIDATOR_TOKEN)),
    "Unauthorized validator",
    401,
  );
}
export async function limitedText(request: Request, limit: number) {
  requireValue(
    Number(request.headers.get("Content-Length") || 0) <= limit,
    "Request too large",
    413,
  );
  if (!request.body) return "";
  const reader = request.body.getReader(),
    decoder = new TextDecoder();
  let size = 0,
    text = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new HttpError(413, "Request too large");
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}
export async function body(request: Request) {
  try {
    const result = JSON.parse(await limitedText(request, 65536));
    requireValue(
      result && typeof result === "object" && !Array.isArray(result),
      "Expected a JSON object",
    );
    return result;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, "Invalid JSON");
  }
}
