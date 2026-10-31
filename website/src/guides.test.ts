// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { guides, renderGuides } from "./guides";
import { parseRoute } from "./routes";
import { advice, profileCheck } from "./compatibility";
import fixtures from "../../contracts/fixtures/compatibility.json";
import { statusLabels } from "./publish-view";

describe("published task guides", () => {
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
