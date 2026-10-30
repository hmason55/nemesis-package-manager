export const API = (import.meta.env.VITE_REGISTRY_URL || "").replace(/\/$/, "");
let token = "";
export function setToken(value: string) {
  token = value;
}
export async function api(path: string, body?: unknown): Promise<any> {
  if (!API)
    throw new Error(
      "The registry is not available yet. Please try again later.",
    );
  const response = await fetch(API + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      ...(token ? { Authorization: "Bearer " + token } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json();
  if (response.status === 401) {
    token = "";
    if (typeof window !== "undefined")
      window.dispatchEvent(new Event("registry-session-expired"));
  }
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
