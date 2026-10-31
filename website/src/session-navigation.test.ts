// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it("restores sign-in before rendering a deep link, retains it across site pages, and signs out explicitly", async () => {
  vi.stubEnv("VITE_REGISTRY_URL", "https://registry.test");
  sessionStorage.clear();
  sessionStorage.setItem(
    "nemesis-session:https://registry.test",
    JSON.stringify({ token: "a".repeat(64), expiresAt: Date.now() + 60000 }),
  );
  document.body.innerHTML = readFileSync("index.html", "utf8")
    .match(/<body>([\s\S]*)<\/body>/)![1]
    .replace(/<script[\s\S]*?<\/script>/g, "");
  history.replaceState(null, "", "/nemesis-package-manager/#publish");
  const calls: { path: string; auth: string | undefined }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      const path = new URL(url).pathname;
      const auth = (init.headers as Record<string, string>).Authorization;
      calls.push({ path, auth });
      if (path === "/v1/publisher/me")
        return Response.json({
          id: 1,
          login: "fixture-publisher",
          admin: true,
          install_url: "https://github.com/apps/example",
        });
      if (path === "/v1/packages")
        return Response.json({
          packages: [],
          categories: [],
          publishers: [],
          total: 0,
          page: 1,
        });
      return Response.json([]);
    }),
  );
  await import("./main");
  const content = document.getElementById("content")!;
  const signin = document.getElementById("signin")!;
  const signout = document.getElementById("signout")!;
  await vi.waitFor(() =>
    expect(content.textContent).toContain("My submissions"),
  );
  expect(calls[0].path).toBe("/v1/publisher/me");
  expect(signin.hidden).toBe(true);
  for (const [hash, text] of [
    ["#packages", "Packages"],
    ["#guides", "Guides"],
    ["#settings", "Settings"],
    ["#moderate", "Registry management"],
    ["#publish", "My submissions"],
  ]) {
    location.hash = hash;
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    await vi.waitFor(() => expect(content.textContent).toContain(text));
    expect(signin.hidden).toBe(true);
    expect(signout.hidden).toBe(false);
  }
  expect(calls.every((call) => call.auth === "Bearer " + "a".repeat(64))).toBe(
    true,
  );
  signout.click();
  await vi.waitFor(() => expect(signin.hidden).toBe(false));
  expect(
    sessionStorage.getItem("nemesis-session:https://registry.test"),
  ).toBeNull();
  expect(calls.at(-1)?.path).toBe("/auth/logout");
});
