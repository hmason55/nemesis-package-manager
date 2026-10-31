// @vitest-environment happy-dom
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { renderSettings, deviceProfile } from "./settings";
import { packageArt } from "./package-art";
import { renderManagement } from "./management";
import { parseRoute } from "./routes";
import { api } from "./client";
vi.mock("./client", async (original) => ({
  ...(await original<any>()),
  api: vi.fn(),
}));
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  delete document.documentElement.dataset.theme;
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("keeps advanced preferences in a shareable Settings page and saves locally", () => {
  expect(parseRoute("#settings")).toEqual({ page: "settings" });
  const root = document.createElement("main");
  renderSettings(root);
  expect(root.querySelector("details")?.open).toBe(false);
  const model = root.querySelector<HTMLInputElement>('[name="vehicle"]')!;
  model.value = "  EV6 ";
  root
    .querySelector("form")!
    .dispatchEvent(new Event("submit", { cancelable: true }));
  expect(deviceProfile()).toEqual({
    vehicle: "EV6",
    firmware: "",
    nemesis: "",
  });
  const theme = root.querySelector("select")!;
  theme.value = "dark";
  theme.dispatchEvent(new Event("change"));
  expect(document.documentElement.dataset.theme).toBe("dark");
  expect(localStorage.getItem("nemesis-theme")).toBe("dark");
  theme.value = "";
  theme.dispatchEvent(new Event("change"));
  expect(document.documentElement.dataset.theme).toBeUndefined();
  Array.from(root.querySelectorAll("button"))
    .find((b) => b.textContent === "Clear profile")!
    .click();
  expect(deviceProfile().vehicle).toBe("");
  expect(api).not.toHaveBeenCalled();
});
it("tolerates damaged profile storage", () => {
  localStorage.setItem("nemesis-device-profile", "null");
  expect(deviceProfile()).toEqual({ vehicle: "", firmware: "", nemesis: "" });
});
it("uses custom artwork, GitHub avatar, then accessible local SVG fallback", () => {
  const root = document.createElement("div");
  packageArt(root, {
    icon_url: "https://registry.test/icon.png",
    publisher: "some-owner",
  });
  let image = root.querySelector("img")!;
  expect(image.src).toBe("https://registry.test/icon.png");
  expect(image.alt).toBe("");
  expect(image.loading).toBe("lazy");
  expect(image.referrerPolicy).toBe("no-referrer");
  image.dispatchEvent(new Event("error"));
  image = root.querySelector("img")!;
  expect(image.src).toBe(
    "https://avatars.githubusercontent.com/some-owner?s=80",
  );
  image.dispatchEvent(new Event("error"));
  expect(root.querySelector("img")).toBeNull();
  expect(root.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  packageArt(root, {
    icon_url: "javascript:alert(1)",
    avatar_url: "https://evil.test/avatar",
    publisher: "<img src=x>",
  });
  expect(root.querySelector("img")).toBeNull();
});
it("manages removal and repository-owner blocks without manual approval controls", async () => {
  const root = document.createElement("main"),
    tasks: Promise<unknown>[] = [];
  const refresh = vi.fn().mockResolvedValue(undefined);
  const controls = {
    run: (task: () => Promise<unknown>) => {
      const result = task();
      tasks.push(result);
      return result.then(() => {});
    },
    refresh,
  };
  vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));
  vi.stubGlobal("prompt", vi.fn().mockReturnValue("  Broken release  "));
  renderManagement(
    root,
    [
      {
        id: "s1",
        package_id: "example/app",
        version: "1",
        metadata: '{"description":"Example"}',
        status: "approved",
        repository: "owner/repo",
        owner_id: 77,
        publisher_id: 99,
      },
    ],
    [{ publisher_id: 88, login: "blocked-user", reason: "Spam" }],
    controls,
  );
  expect(root.textContent).not.toMatch(/Approve|Reject/);
  const click = (label: string) =>
    Array.from(root.querySelectorAll("button"))
      .find((b) => b.textContent === label)!
      .click();
  click("Remove package");
  await Promise.all(tasks);
  expect(api).toHaveBeenCalledWith("/v1/admin/packages/example%2Fapp/remove", {
    reason: "Broken release",
  });
  expect(window.confirm).toHaveBeenCalledWith(
    expect.stringContaining("all published versions"),
  );
  click("Block repository owner");
  await Promise.all(tasks);
  expect(api).toHaveBeenCalledWith("/v1/admin/publishers/77/block", {
    reason: "Broken release",
  });
  click("Unblock publisher");
  await Promise.all(tasks);
  expect(api).toHaveBeenCalledWith("/v1/admin/publishers/88/unblock", {
    reason: "Broken release",
  });
  expect(refresh).toHaveBeenCalledTimes(3);
  vi.mocked(window.confirm).mockReturnValue(false);
  click("Remove package");
  await Promise.all(tasks);
  expect(api).toHaveBeenCalledTimes(3);
});
