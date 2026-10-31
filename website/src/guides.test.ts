// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { guides, renderGuides } from "./guides";
import { parseRoute } from "./routes";
import { advice, profileCheck } from "./compatibility";
import fixtures from "../../contracts/fixtures/compatibility.json";
import { statusLabels } from "./publish-view";

describe("published task guides", () => {
  it("links download instructions to Releases and the actual release assets", () => {
    const start = document.createElement("div");
    renderGuides(start, "start");
    const releases = start.querySelector<HTMLAnchorElement>(
      'a[href="https://github.com/hmason55/nemesis-package-manager/releases"]',
    )!;
    expect(releases.textContent).toBe("repository’s Releases page");
    expect(releases.target).toBe("_blank");
    expect(releases.rel).toContain("noopener");
    expect(
      start.querySelector(
        'a[href$="/releases/latest/download/usb-package-manager-ready.zip"]',
      ),
    ).not.toBeNull();
    const companion = document.createElement("div");
    renderGuides(companion, "companion-manual");
    expect(
      companion.querySelector(
        'a[href$="/nemesis-usb-companion-windows-x86_64.zip"]',
      )?.textContent,
    ).toBe("Windows");
    expect(
      companion.querySelector(
        'a[href$="/nemesis-usb-companion-linux-x86_64.tar.gz"]',
      )?.textContent,
    ).toBe("Linux x86-64");
    expect(companion.textContent).not.toMatch(/\]\(https:/);
  });

  it("links website actions to the matching pages and preserves local navigation", () => {
    const publish = document.createElement("div");
    renderGuides(publish, "publish");
    expect(
      publish.querySelector<HTMLAnchorElement>('a[href="#publish"]')?.target,
    ).toBe("");
    expect(publish.querySelector('a[href="#moderate"]')).not.toBeNull();
    const registry = document.createElement("div");
    renderGuides(registry, "registry");
    expect(registry.querySelector('a[href="#packages"]')).not.toBeNull();
    expect(registry.querySelector('a[href="#settings"]')).not.toBeNull();
  });

  it("resolves referenced repository documents and section anchors", () => {
    for (const guide of guides) {
      const root = document.createElement("div");
      renderGuides(root, guide.id);
      for (const link of root.querySelectorAll<HTMLAnchorElement>(
        'a[href^="https://github.com/hmason55/nemesis-package-manager/blob/main/docs/"]',
      )) {
        const url = new URL(link.href);
        const file = url.pathname.split("/blob/main/")[1];
        const source = readFileSync(
          new URL("../../" + file, import.meta.url),
          "utf8",
        );
        const headings = [...source.matchAll(/^#+ (.+)$/gm)].map((match) =>
          match[1]
            .trim()
            .toLowerCase()
            .replace(/[^\w\s-]/g, "")
            .replace(/\s+/g, "-"),
        );
        if (url.hash) expect(headings).toContain(url.hash.slice(1));
      }
    }
  });

  it("renders unsafe link schemes and HTML as plain text", () => {
    const steps = guides[0].sections[0].steps;
    steps.push("[unsafe](javascript:alert) <script>alert(1)</script>");
    try {
      const root = document.createElement("div");
      renderGuides(root, "start");
      expect(root.querySelector('a[href^="javascript:"]')).toBeNull();
      expect(root.querySelector("script")).toBeNull();
      expect(root.textContent).toContain(
        "[unsafe](javascript:alert) <script>alert(1)</script>",
      );
    } finally {
      steps.pop();
    }
  });
  it("keeps repository and site dialog illustrations identical and correctly described", () => {
    for (const [name, title] of [
      ["manager-source", "Package Manager: choose source"],
      ["vehicle-settings", "Package Manager settings"],
    ]) {
      const site = readFileSync(
        new URL("../public/guides/" + name + ".svg", import.meta.url),
        "utf8",
      );
      const repo = readFileSync(
        new URL("../../docs/images/" + name + ".svg", import.meta.url),
        "utf8",
      );
      expect(site).toBe(repo);
      expect(site).toContain('<title id="title">' + title + "</title>");
    }
  });
  it("documents actual restore controls, stable artifact identity, and keyboard recovery", () => {
    const publish = document.createElement("div");
    renderGuides(publish, "publish");
    expect(publish.textContent).toContain("My submissions");
    expect(publish.textContent).toContain("Republish version");
    expect(publish.textContent).toContain("original URL and SHA-256");
    expect(publish.textContent).toContain(
      "Administrator and older withdrawals require administrator recovery",
    );
    const vehicle = document.createElement("div");
    renderGuides(vehicle, "vehicle");
    expect(vehicle.textContent).toContain("Back");
    expect(vehicle.textContent).toContain("Save applies settings");
    expect(vehicle.textContent).toContain(
      "scan starts after the prompt closes",
    );
  });
  it("explains automatic trusted publication without presenting a maintainer gate", () => {
    const root = document.createElement("div");
    renderGuides(root, "publish");
    expect(root.textContent).toContain("publishes automatically");
    expect(root.textContent).toContain("no administrator approval is required");
    expect(root.textContent).not.toContain("Awaiting review");
    expect(statusLabels.review).toBe("Finishing publication");
    expect(statusLabels.approved).toBe("Published");
    const companion = document.createElement("div");
    renderGuides(companion, "companion-registry");
    expect(companion.textContent).toContain(
      "built-in staging registry address",
    );
    expect(companion.textContent).toContain(
      "Manual imports remain available offline",
    );
  });
  it("keeps old help links and individual guide sections shareable", () => {
    expect(parseRoute("#help")).toEqual({ page: "guides", id: "", section: 0 });
    expect(parseRoute("#guides/publish?section=2")).toEqual({
      page: "guides",
      id: "publish",
      section: 2,
    });
  });
  it("renders every guide with steps, an available described image, and working related links", () => {
    for (const guide of guides) {
      const root = document.createElement("div");
      renderGuides(root, guide.id);
      expect(root.querySelectorAll("ol").length).toBe(guide.sections.length);
      expect(root.querySelector("img")?.alt).toBeTruthy();
      expect(
        existsSync(
          new URL("../public/guides/" + guide.figure, import.meta.url),
        ),
      ).toBe(true);
      for (const a of Array.from(
        root.querySelectorAll<HTMLAnchorElement>('a[href^="#guides/"]'),
      )) {
        const id = a.getAttribute("href")!.split("/")[1].split("?")[0];
        expect(guides.some((g) => g.id === id)).toBe(true);
      }
    }
  });
  it("offers useful navigation for unknown guide bookmarks", () => {
    const root = document.createElement("div");
    renderGuides(root, "missing");
    expect(root.textContent).toContain("Guide not found");
    expect(root.querySelectorAll("h2 a").length).toBe(guides.length);
  });
});
describe("optional advisory compatibility", () => {
  it("matches the shared contract fixtures", () => {
    for (const f of fixtures)
      expect(advice(f.declarations, f.profile).status, f.name).toBe(f.status);
  });
  it("shows mismatches without creating an installation or download gate", () => {
    localStorage.clear();
    localStorage.setItem(
      "nemesis-device-profile",
      JSON.stringify({ vehicle: "IONIQ 5" }),
    );
    const root = document.createElement("div");
    const download = document.createElement("a");
    download.href = "https://registry.test/download";
    download.textContent = "Download";
    root.append(download);
    profileCheck(root, { vehicles: ["EV6"], firmware: [], nemesis: "" });
    expect(root.textContent).toContain("Compatibility warning");
    expect(root.textContent).toContain(
      "Downloads and installation remain available",
    );
    expect(download.getAttribute("href")).toBe(
      "https://registry.test/download",
    );
    expect(root.querySelector("[disabled]")).toBeNull();
    expect(root.querySelector("input")).toBeNull();
    expect(root.querySelector('a[href="#settings"]')).not.toBeNull();
  });
});
