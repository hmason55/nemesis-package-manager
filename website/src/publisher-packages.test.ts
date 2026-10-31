// @vitest-environment happy-dom
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { renderPublish } from "./publish-view";
import { renderPublisherPackages } from "./publisher-packages";
import { api } from "./client";
vi.mock("./client", async (original) => ({
  ...(await original<any>()),
  api: vi.fn(),
}));
const pkg = {
  id: "example.app",
  repository: "publisher/repo",
  metadata: JSON.stringify({ name: "Example Utility" }),
  published_versions: 2,
};
let root: HTMLElement;
const controls = {
  run: async (task: () => Promise<unknown>) => {
    await task();
  },
  refresh: vi.fn(async () => {}),
  notify: vi.fn(),
};
beforeEach(() => {
  vi.clearAllMocks();
  document.body.replaceChildren();
  root = document.createElement("main");
  document.body.append(root);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("signed-out publishers cannot see removal controls or fetch owned packages", async () => {
  await renderPublish(root, null, {
    ...controls,
    active: () => true,
    signin: vi.fn(),
  });
  expect(api).not.toHaveBeenCalled();
  expect(root.textContent).not.toContain("Unpublish package");
});
it("the signed-in publisher dashboard displays only server-authorized package cards", async () => {
  vi.mocked(api).mockImplementation(async (path) =>
    path === "/v1/publisher/packages" ? [pkg] : [],
  );
  await renderPublish(
    root,
    { id: 1, installation_url: "https://github.com/apps/example" },
    { ...controls, active: () => true, signin: vi.fn() },
  );
  expect(root.textContent).toContain("My published packages");
  expect(root.querySelectorAll(".submission-row").length).toBe(1);
  expect(root.textContent).toContain("2 published versions");
  expect(root.querySelector('a[href="#packages/example.app"]')).not.toBeNull();
});
it("requires confirmation and a reason before sending the owned-package removal", async () => {
  const tasks: Promise<unknown>[] = [];
  const confirm = vi.fn(() => false);
  const prompt = vi.fn<() => string | null>(() => " Retired ");
  vi.stubGlobal("confirm", confirm);
  vi.stubGlobal("prompt", prompt);
  renderPublisherPackages(root, [pkg], {
    ...controls,
    run: (task) => {
      const promise = task();
      tasks.push(promise);
      return promise;
    },
  });
  const button = root.querySelector("button")!;
  button.click();
  await tasks.pop();
  expect(api).not.toHaveBeenCalled();
  expect(prompt).not.toHaveBeenCalled();
  confirm.mockReturnValue(true);
  prompt.mockReturnValue(null);
  button.click();
  await tasks.pop();
  expect(api).not.toHaveBeenCalled();
  prompt.mockReturnValue("  ");
  button.click();
  await expect(tasks.pop()).rejects.toThrow("Enter a reason");
  expect(api).not.toHaveBeenCalled();
  prompt.mockReturnValue(" Retired ");
  button.click();
  await tasks.pop();
  expect(confirm).toHaveBeenCalledWith(
    expect.stringContaining("Unpublish all versions of example.app"),
  );
  expect(api).toHaveBeenCalledWith(
    "/v1/publisher/packages/example.app/remove",
    { reason: "Retired" },
  );
  expect(controls.refresh).toHaveBeenCalledTimes(1);
  expect(controls.notify).toHaveBeenCalledWith(
    expect.stringContaining("was unpublished"),
  );
});
it("keeps the card and restores its button when the server rejects removal", async () => {
  vi.stubGlobal(
    "confirm",
    vi.fn(() => true),
  );
  vi.stubGlobal(
    "prompt",
    vi.fn(() => "Retired"),
  );
  vi.mocked(api).mockRejectedValue(new Error("Permission revoked"));
  let task: Promise<unknown>;
  renderPublisherPackages(root, [pkg], {
    ...controls,
    run: (f) => (task = f()),
  });
  const button = root.querySelector("button")!;
  button.click();
  await expect(task!).rejects.toThrow("Permission revoked");
  expect(button.disabled).toBe(false);
  expect(root.textContent).toContain("Example Utility");
  expect(controls.refresh).not.toHaveBeenCalled();
});
it("gives an empty-state message without removal controls", () => {
  renderPublisherPackages(root, [], controls);
  expect(root.textContent).toContain("no published packages to remove");
  expect(root.querySelector("button")).toBeNull();
});
