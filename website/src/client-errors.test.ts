// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  sessionStorage.clear();
  vi.stubEnv("VITE_REGISTRY_URL", "https://registry.test");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

it("explains a missing endpoint instead of showing a JSON parser error", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("Not found", { status: 404 })),
  );
  const client = await import("./client");
  client.setToken("a".repeat(64));
  await expect(client.api("/v1/publisher/packages")).rejects.toThrow(
    "after the registry is updated",
  );
  expect(client.hasSession()).toBe(true);
});

it("does not display HTML from a failed provider response", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response("<html>Provider failure</html>", { status: 502 }),
    ),
  );
  const { api } = await import("./client");
  await expect(api("/v1/publisher/submissions")).rejects.toThrow(
    "The registry could not complete this request",
  );
});

it("reports malformed successful responses", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("not JSON")),
  );
  const { api } = await import("./client");
  await expect(api("/v1/packages")).rejects.toThrow("unreadable response");
});

it("preserves server validation errors and handles null error bodies", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ error: "Repository access revoked" }, { status: 403 }),
      )
      .mockResolvedValueOnce(Response.json(null, { status: 500 })),
  );
  const { api } = await import("./client");
  await expect(api("/v1/publisher/submissions", {})).rejects.toThrow(
    "Repository access revoked",
  );
  await expect(api("/v1/publisher/submissions")).rejects.toThrow(
    "The registry could not complete this request",
  );
});

it("expires the session even when a 401 response is not JSON", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("Unauthorized", { status: 401 })),
  );
  const client = await import("./client");
  client.setToken("a".repeat(64));
  const expired = vi.fn();
  window.addEventListener("registry-session-expired", expired);
  try {
    await expect(client.api("/v1/publisher/me")).rejects.toThrow(
      "could not complete",
    );
    expect(client.hasSession()).toBe(false);
    expect(expired).toHaveBeenCalledOnce();
  } finally {
    window.removeEventListener("registry-session-expired", expired);
  }
});
