// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api } from "./client";
import { renderPublish } from "./publish-view";

vi.mock("./client", async (original) => ({
  ...(await original<any>()),
  api: vi.fn(),
}));

const metadata = {
  name: "Example",
  description: "Original description",
  categories: [],
  compatibility: { vehicles: [], firmware: [], nemesis: "" },
  release_notes: "",
};
const withdrawn = {
  id: "ab".repeat(32),
  repository_id: 10,
  package_id: "example.app",
  version: "1.2",
  status: "withdrawn",
  withdrawn_by: 7,
  asset_id: 30,
  metadata: JSON.stringify(metadata),
};
let root: HTMLElement;
let tasks: Promise<unknown>[];
let controls: Parameters<typeof renderPublish>[2];

beforeEach(() => {
  vi.clearAllMocks();
  root = document.createElement("main");
  document.body.replaceChildren(root);
  tasks = [];
  controls = {
    run: (task) => {
      const promise = task();
      tasks.push(promise);
      return promise.then(
        () => {},
        () => {},
      );
    },
    notify: vi.fn(),
    refresh: vi.fn(async () => {}),
    active: () => true,
    signin: vi.fn(),
  };
  vi.stubGlobal(
    "confirm",
    vi.fn(() => true),
  );
  vi.stubGlobal(
    "prompt",
    vi.fn(() => " Ready again "),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function review(existing = withdrawn, user = { id: 7, admin: false }) {
  vi.mocked(api).mockImplementation(async (path) => {
    if (path === "/v1/publisher/repositories")
      return [{ id: 10, full_name: "owner/repo" }];
    if (path === "/v1/publisher/submissions") return [existing];
    if (path.endsWith("/releases"))
      return [
        {
          id: 20,
          tag_name: "v1.2",
          body: "New notes",
          assets: [{ id: 99, name: "changed.zip", size: 2048 }],
        },
      ];
    return [];
  });
  await renderPublish(root, user, controls);
  const form = root.querySelector<HTMLFormElement>(".publish-wizard")!;
  await submit(form);
  const release = form.querySelector<HTMLSelectElement>("[name=release_id]")!;
  release.value = "20";
  release.dispatchEvent(new Event("change"));
  // Case differences must not bypass the reserved version check.
  form.querySelector<HTMLInputElement>("[name=package_id]")!.value =
    "EXAMPLE.APP";
  await submit(form);
  return form;
}
async function submit(form: HTMLFormElement) {
  form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
  await tasks.at(-1);
}
function restore(form: HTMLFormElement) {
  return [...form.querySelectorAll("button")].find(
    (b) => b.textContent === "Republish version",
  )!;
}
function createdSubmission() {
  return vi
    .mocked(api)
    .mock.calls.some(
      ([path, body]) => path === "/v1/publisher/submissions" && body,
    );
}

it("offers restoration in the wizard instead of submitting a replacement ZIP", async () => {
  const form = await review();
  expect(form.textContent).toContain("This version was withdrawn");
  expect(form.textContent).toContain(
    "ZIP and edits selected above will not be submitted",
  );
  expect(
    form.querySelector<HTMLButtonElement>("button[type=submit]")!.hidden,
  ).toBe(true);
  await submit(form); // Enter or a programmatic submit must not create a replacement.
  expect(createdSubmission()).toBe(false);
  restore(form).click();
  await tasks.at(-1);
  expect(api).toHaveBeenCalledWith(
    "/v1/publisher/submissions/" + withdrawn.id + "/republish",
    { reason: "Ready again" },
  );
  expect(createdSubmission()).toBe(false);
  expect(controls.refresh).toHaveBeenCalledOnce();
});

it("keeps other publishers from restoring another user's withdrawal", async () => {
  const form = await review({ ...withdrawn, withdrawn_by: 8 });
  expect(restore(form)).toBeUndefined();
  expect(form.textContent).toContain("Contact a registry administrator");
  await submit(form);
  expect(createdSubmission()).toBe(false);
});

it("lets an administrator restore an older withdrawal through the admin endpoint", async () => {
  const form = await review(
    { ...withdrawn, withdrawn_by: null as any },
    { id: 7, admin: true },
  );
  restore(form).click();
  await tasks.at(-1);
  expect(api).toHaveBeenCalledWith(
    "/v1/admin/submissions/" + withdrawn.id + "/republish",
    { reason: "Ready again" },
  );
  expect(createdSubmission()).toBe(false);
});

it("does not restore an already published version", async () => {
  const form = await review({ ...withdrawn, status: "approved" });
  expect(form.textContent).toContain("already published");
  expect(restore(form)).toBeUndefined();
  await submit(form);
  expect(createdSubmission()).toBe(false);
});

it("allows a new version after going back from the restore screen", async () => {
  const form = await review();
  [...form.querySelectorAll<HTMLButtonElement>("button")]
    .find((b) => b.textContent === "Back")!
    .click();
  expect(
    form.querySelector<HTMLButtonElement>("button[type=submit]")!.hidden,
  ).toBe(false);
  form.querySelector<HTMLInputElement>("[name=version]")!.value = "1.3";
  await submit(form);
  expect(restore(form)).toBeUndefined();
  await submit(form);
  expect(api).toHaveBeenCalledWith(
    "/v1/publisher/submissions",
    expect.objectContaining({ version: "1.3", asset_id: 99 }),
  );
});

it("requires confirmation and a nonempty reason, and supports retry after an API failure", async () => {
  const form = await review();
  const button = restore(form);
  vi.mocked(window.confirm).mockReturnValue(false);
  button.click();
  await tasks.at(-1);
  expect(window.prompt).not.toHaveBeenCalled();
  vi.mocked(window.confirm).mockReturnValue(true);
  vi.mocked(window.prompt).mockReturnValue(null);
  button.click();
  await tasks.at(-1);
  vi.mocked(window.prompt).mockReturnValue(" ");
  button.click();
  await expect(tasks.at(-1)).rejects.toThrow("Enter a reason");
  expect(api).not.toHaveBeenCalledWith(
    expect.stringContaining("/republish"),
    expect.anything(),
  );
  vi.mocked(window.prompt).mockReturnValue("Ready again");
  vi.mocked(api).mockRejectedValueOnce(new Error("Repository access revoked"));
  button.click();
  await expect(tasks.at(-1)).rejects.toThrow("Repository access revoked");
  expect(button.disabled).toBe(false);
  expect(controls.refresh).not.toHaveBeenCalled();
  button.click();
  await tasks.at(-1);
  expect(controls.refresh).toHaveBeenCalledOnce();
});
