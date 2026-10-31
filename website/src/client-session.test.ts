// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const registry = "https://registry.test";
const key = "nemesis-session:" + registry;
const first = "a".repeat(64),
  second = "b".repeat(64);

beforeEach(() => {
  vi.resetModules();
  sessionStorage.clear();
  vi.stubEnv("VITE_REGISTRY_URL", registry);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
function mockResponse(status = 200) {
  const fetcher = vi
    .fn()
    .mockResolvedValue(
      Response.json(
        status === 200 ? { ok: true } : { error: "Session expired" },
        { status },
      ),
    );
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}

it("restores the same tab's session after a full page load without extending expiry", async () => {
  const client = await import("./client");
  client.setToken(first, 120);
  const saved = sessionStorage.getItem(key);
  vi.resetModules();
  const restored = await import("./client");
  const fetcher = mockResponse();
  expect(restored.hasSession()).toBe(true);
  await restored.api("/v1/publisher/me");
  expect(fetcher.mock.calls[0][1].headers.Authorization).toBe(
    "Bearer " + first,
  );
  expect(sessionStorage.getItem(key)).toBe(saved);
});

it("does not restore expired, malformed, or another registry's credentials", async () => {
  for (const saved of [
    "not json",
    JSON.stringify({ token: first, expiresAt: Date.now() - 1 }),
    JSON.stringify({ token: {}, expiresAt: Date.now() + 60000 }),
  ]) {
    sessionStorage.setItem(key, saved);
    vi.resetModules();
    expect((await import("./client")).hasSession()).toBe(false);
  }
  sessionStorage.setItem(
    key,
    JSON.stringify({ token: first, expiresAt: Date.now() + 60000 }),
  );
  vi.stubEnv("VITE_REGISTRY_URL", "https://another-registry.test");
  vi.resetModules();
  const client = await import("./client");
  const fetcher = mockResponse();
  expect(client.hasSession()).toBe(false);
  await client.api("/v1/packages");
  expect(fetcher.mock.calls[0][1].headers.Authorization).toBeUndefined();
});

it("clears persisted credentials on sign-out and authenticated expiry", async () => {
  const client = await import("./client");
  client.setToken(first);
  client.setToken("");
  expect(sessionStorage.getItem(key)).toBeNull();
  expect(client.hasSession()).toBe(false);
  client.setToken(first);
  mockResponse(401);
  const expired = vi.fn();
  window.addEventListener("registry-session-expired", expired);
  try {
    await expect(client.api("/v1/publisher/me")).rejects.toThrow(
      "Session expired",
    );
    expect(client.hasSession()).toBe(false);
    expect(sessionStorage.getItem(key)).toBeNull();
    expect(expired).toHaveBeenCalledOnce();
  } finally {
    window.removeEventListener("registry-session-expired", expired);
  }
});

it("keeps the session through provider errors and delayed errors from a previous sign-in", async () => {
  const client = await import("./client");
  client.setToken(first);
  mockResponse(503);
  await expect(client.api("/v1/publisher/me")).rejects.toThrow();
  expect(client.hasSession()).toBe(true);
  let finish!: (response: Response) => void;
  vi.stubGlobal(
    "fetch",
    vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    ),
  );
  const oldRequest = client.api("/v1/publisher/submissions");
  client.setToken(second);
  finish(Response.json({ error: "Old session expired" }, { status: 401 }));
  await expect(oldRequest).rejects.toThrow("Old session expired");
  expect(JSON.parse(sessionStorage.getItem(key)!).token).toBe(second);
  expect(client.hasSession()).toBe(true);
});

it("still supports in-memory navigation when browser storage is unavailable", async () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw Error("Storage blocked");
  });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw Error("Storage blocked");
  });
  const client = await import("./client");
  client.setToken(first);
  const fetcher = mockResponse();
  await client.api("/v1/publisher/me");
  expect(fetcher.mock.calls[0][1].headers.Authorization).toBe(
    "Bearer " + first,
  );
});
