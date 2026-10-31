import { describe, it, expect } from "vitest";
import { parseRoute, packageLink, catalogLink } from "./routes";
describe("shareable registry routes", () => {
  it("retains literal version and search identities", () => {
    expect(parseRoute(packageLink("example.app", "release blue+1"))).toEqual({
      page: "package",
      id: "example.app",
      version: "release blue+1",
    });
    expect(
      parseRoute(catalogLink("media & tools", "Utilities", "recent", 2)),
    ).toEqual({
      page: "packages",
      query: "media & tools",
      category: "Utilities",
      sort: "recent",
      number: 2,
      publisher: "",
      maxSize: "",
    });
  });
  it("falls back safely for malformed paths, page numbers, and sort values", () => {
    expect(parseRoute("#packages/%xx").page).toBe("packages");
    expect(parseRoute("#packages?page=-1&sort=bad")).toEqual({
      page: "packages",
      query: "",
      category: "",
      sort: "name",
      number: 1,
      publisher: "",
      maxSize: "",
    });
  });
});
