export const API = (import.meta.env.VITE_REGISTRY_URL || "").replace(/\/$/, "");
const sessionKey = "nemesis-session:" + API;
let token = restoreToken();
function restoreToken() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(sessionKey) || "null");
    if (
      saved &&
      typeof saved.token === "string" &&
      /^[a-f0-9]{64}$/.test(saved.token) &&
      Number.isFinite(saved.expiresAt) &&
      saved.expiresAt > Date.now()
    )
      return saved.token as string;
    sessionStorage.removeItem(sessionKey);
  } catch {}
  return "";
}
export function hasSession() {
  return token !== "";
}
export function setToken(value: string, expiresIn = 3600) {
  token = value;
  try {
    if (value)
      sessionStorage.setItem(
        sessionKey,
        JSON.stringify({
          token: value,
          expiresAt: Date.now() + expiresIn * 1000,
        }),
      );
    else sessionStorage.removeItem(sessionKey);
  } catch {}
}
export async function api(path: string, body?: unknown): Promise<any> {
  if (!API)
    throw new Error(
      "The registry is not available yet. Please try again later.",
    );
  const requestToken = token;
  const response = await fetch(API + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      ...(requestToken ? { Authorization: "Bearer " + requestToken } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (response.status === 401 && requestToken && requestToken === token) {
    setToken("");
    if (typeof window !== "undefined")
      window.dispatchEvent(new Event("registry-session-expired"));
  }
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Registry request failed");
  return result;
}
export function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text = "",
  className = "",
): HTMLElementTagNameMap[K] {
  const item = document.createElement(tag);
  item.textContent = text;
  item.className = className;
  return item;
}
export function compatibility(value: any) {
  return (
    "Vehicles: " +
    (value?.vehicles?.join(", ") || "Not specified") +
    " · Firmware: " +
    (value?.firmware?.join(", ") || "Not specified") +
    " · NEMESIS: " +
    (value?.nemesis || "Not specified")
  );
}
