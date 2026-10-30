import { describe, it, expect } from "vitest";
import { compatibility } from "./client";
describe("compatibility display", () => {
  it("states that unknown requirements are unspecified", () => {
    expect(
      compatibility({ vehicles: [], firmware: [], nemesis: "" }),
    ).toContain("Not specified");
  });
  it("retains explicit publisher requirements", () => {
    expect(
      compatibility({
        vehicles: ["IONIQ 5"],
        firmware: ["260507"],
        nemesis: "1+",
      }),
    ).toBe("Vehicles: IONIQ 5 · Firmware: 260507 · NEMESIS: 1+");
  });
});
