// @vitest-environment happy-dom
import { beforeEach, describe, it, expect, vi } from "vitest";
import { renderCatalog, renderPackage } from "./catalog-view";
import { renderPublish } from "./publish-view";
import { api } from "./client";
vi.mock("./client", async (original) => ({
  ...(await original<any>()),
  api: vi.fn(),
}));
let root: HTMLElement;
const metadata = {
  name: "Example Utility",
  description: "A real description",
  categories: ["Utilities"],
  compatibility: { vehicles: ["IONIQ 5"], firmware: ["260507"], nemesis: "1+" },
  release_notes: "Changes in this release",
};
const version = {
  ...metadata,
  package_id: "example.app",
  version: "1.2",
  size: 1024,
  sha256: "a".repeat(64),
  download_url:
    "https://registry.test/v1/packages/example.app/versions/1.2/download",
};
beforeEach(() => {
  document.body.replaceChildren();
  root = document.createElement("main");
  document.body.append(root);
  vi.clearAllMocks();
});
describe("NuGet-inspired package navigation", () => {
  it("does not silently replace a withdrawn version bookmark with a different download", () => {
    renderPackage(
      root,
      {
        ...metadata,
        id: "example.app",
        repository: "publisher/repo",
        versions: [version],
      },
      "withdrawn-version",
      vi.fn(),
      vi.fn(),
    );
    expect(root.textContent).toContain("withdrawn-version is not available");
    expect(root.querySelector("a.primary")).toBeNull();
    expect(
      root.querySelector('a[href="#packages/example.app?version=1.2"]'),
    ).not.toBeNull();
  });
  it("shows meaningful result counts, labeled filters, and real package links", () => {
    renderCatalog(
      root,
      {
        packages: [
          {
            ...metadata,
            id: "example.app",
            publisher: "publisher",
            latest_published_version: "1.2",
            version_count: 2,
          },
        ],
        categories: ["Utilities"],
        total: 1,
        next_page: null,
      },
      "example",
      "",
      "name",
      1,
      vi.fn(),
    );
    expect(root.textContent).toContain("1 package");
    expect(root.querySelector("h2 a")?.getAttribute("href")).toBe(
      "#packages/example.app",
    );
    const select = root.querySelector("select")!;
    expect(
      root.querySelector('label[for="' + select.id + '"]')?.textContent,
    ).toBe("Category");
    expect(root.textContent).toContain("Latest published: 1.2");
  });
  it("offers an actionable empty search state", () => {
    renderCatalog(
      root,
      { packages: [], categories: [], total: 0, next_page: null },
      "missing",
      "",
      "name",
      1,
      vi.fn(),
    );
    expect(root.textContent).toContain("No packages found");
    expect(
      root.querySelector('a[href="#packages?q=&category=&sort=name&page=1"]'),
    ).not.toBeNull();
  });
  it("switches package information tabs with keyboard and selected versions by URL", () => {
    const navigate = vi.fn();
    renderPackage(
      root,
      {
        ...metadata,
        id: "example.app",
        repository: "publisher/repo",
        versions: [version, { ...version, version: "1.1" }],
      },
      "",
      navigate,
      vi.fn(),
    );
    const tabs = Array.from(
      root.querySelectorAll<HTMLButtonElement>("[role=tab]"),
    );
    tabs[0].dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
    );
    expect(tabs[1].getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(tabs[1]);
    expect(root.textContent).toContain("Firmware: 260507");
    const select = root.querySelector("select")!;
    select.value = "1.1";
    select.dispatchEvent(new Event("change"));
    expect(navigate).toHaveBeenCalledWith("#packages/example.app?version=1.1");
    expect(root.querySelector("a.primary")?.getAttribute("href")).toBe(
      version.download_url,
    );
  });
});
describe("publisher onboarding", () => {
  it("keeps the signed-out flow clear without a submission form", async () => {
    await renderPublish(root, null, {
      run: async (f) => {
        await f();
      },
      notify: vi.fn(),
      active: () => true,
      signin: vi.fn(),
      refresh: vi.fn(),
    });
    expect(root.textContent).toContain("An account is only needed to publish");
    expect(root.querySelector("form")).toBeNull();
  });
  it("prefills a release, reviews its identity, and submits only at the final step", async () => {
    vi.mocked(api).mockImplementation(async (path) =>
      path.endsWith("/repositories")
        ? [{ id: 10, full_name: "owner/repo" }]
        : path.endsWith("/releases")
          ? [
              {
                id: 20,
                tag_name: "v1.2",
                body: "Release notes",
                html_url: "https://github.com/owner/repo/releases/tag/v1.2",
                assets: [{ id: 30, name: "example.zip", size: 1024 }],
              },
            ]
          : path.endsWith("/submissions")
            ? []
            : [],
    );
    const controls = {
      run: async (f: () => Promise<unknown>) => {
        await f();
      },
      notify: vi.fn(),
      active: () => true,
      signin: vi.fn(),
      refresh: vi.fn(),
    };
    await renderPublish(
      root,
      { installation_url: "https://github.com/apps/example/installations/new" },
      controls,
    );
    const form = root.querySelector<HTMLFormElement>(".publish-wizard")!;
    expect(root.textContent).toContain("your package is published automatically");
    expect(root.textContent).not.toContain("maintainer reviews this version");
    form.dispatchEvent(
      new Event("submit", { cancelable: true, bubbles: true }),
    );
    await new Promise((r) => setTimeout(r, 0));
    const release = form.querySelector<HTMLSelectElement>("[name=release_id]")!;
    release.value = "20";
    release.dispatchEvent(new Event("change"));
    expect(
      (form.querySelector("[name=version]") as HTMLInputElement).value,
    ).toBe("1.2");
    expect(
      (form.querySelector("[name=release_notes]") as HTMLInputElement).value,
    ).toBe("Release notes");
    for (const [name, value] of Object.entries({
      package_id: "example.app",
      name: "Example Utility",
      description: "Description",
    }))
      (form.querySelector("[name=" + name + "]") as HTMLInputElement).value =
        value;
    form.dispatchEvent(
      new Event("submit", { cancelable: true, bubbles: true }),
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(form.textContent).toContain("example.app 1.2");
    expect(
      vi.mocked(api).mock.calls.some((call) => call[1] !== undefined),
    ).toBe(false);
    form.dispatchEvent(
      new Event("submit", { cancelable: true, bubbles: true }),
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(api).toHaveBeenCalledWith(
      "/v1/publisher/submissions",
      expect.objectContaining({
        package_id: "example.app",
        version: "1.2",
        asset_id: 30,
      }),
    );
    expect(controls.refresh).toHaveBeenCalled();
  });
});

