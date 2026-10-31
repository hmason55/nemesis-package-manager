// @vitest-environment happy-dom
import { beforeEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { URL as NodeURL } from "node:url";
import { action } from "./ui";
import { labelAction } from "./icons";

beforeEach(() => {
  document.body.replaceChildren();
  history.replaceState(null, "", "/");
});

it("pairs important site actions with decorative icons and keeps their labels and behavior", () => {
  const click = vi.fn();
  for (const label of [
    "Republish version",
    "Unpublish package",
    "Save profile",
    "Copy download link",
  ]) {
    const button = action(label, click);
    expect(button.textContent).toBe(label);
    expect(button.querySelector("svg")?.getAttribute("aria-hidden")).toBe(
      "true",
    );
    expect(button.querySelector("svg")?.getAttribute("focusable")).toBe(
      "false",
    );
    button.click();
  }
  expect(click).toHaveBeenCalledTimes(4);
});

it("replaces rather than stacks icons when theme and wizard labels change", () => {
  const button = document.createElement("button");
  labelAction(button, "Use light theme");
  const sun = button.querySelector("path")!.getAttribute("d");
  labelAction(button, "Use dark theme");
  expect(button.querySelectorAll("svg")).toHaveLength(1);
  expect(button.querySelector("path")!.getAttribute("d")).not.toBe(sun);
  labelAction(button, "Submit for validation");
  expect(button.textContent).toBe("Submit for validation");
  expect(button.querySelectorAll("svg")).toHaveLength(1);
});

function companion() {
  const root = new NodeURL("../../tools/companion_ui/", import.meta.url);
  const html = readFileSync(new NodeURL("index.html", root), "utf8");
  document.body.innerHTML = html
    .match(/<body>([\s\S]*)<\/body>/)![1]
    .replace(/<script[\s\S]*?<\/script>/g, "");
  // No session hash: startup never calls a drive API. Only DOM rendering runs.
  return new Function(
    readFileSync(new NodeURL("app.js", root), "utf8") +
      `
    return { syncImport, renderPackages, labelControl, setSelected(value) { selected = value; } };
  `,
  )();
}

it("decorates offline companion controls without losing tab counts or text", () => {
  companion();
  for (const id of [
    "tab-packages",
    "setup",
    "check-release",
    "cloud-clear",
    "cloud-filter-summary",
  ]) {
    const control = document.getElementById(id)!;
    expect(control.querySelectorAll("svg")).toHaveLength(1);
    expect(control.querySelector("svg")!.getAttribute("aria-hidden")).toBe(
      "true",
    );
    expect(control.textContent!.trim().length).toBeGreaterThan(0);
  }
  expect(document.getElementById("package-count")).not.toBeNull();
});

it("keeps companion icons through import mode changes and package list refreshes", () => {
  const app = companion();
  const mode = document.getElementById("import-mode") as HTMLSelectElement;
  mode.value = "update";
  app.syncImport();
  expect(document.getElementById("import-submit")!.textContent).toBe(
    "Update package",
  );
  mode.value = "add";
  app.syncImport();
  expect(
    document.getElementById("import-submit")!.querySelectorAll("svg"),
  ).toHaveLength(1);
  app.setSelected({
    packages: [
      {
        name: "Example <img src=x>",
        id: "example.app",
        folder: "Example",
        kind: "install",
        version: "1.2",
        replaceable: true,
      },
    ],
  });
  app.renderPackages();
  app.renderPackages();
  const remove = document.querySelector<HTMLButtonElement>(
    ".row-action button.danger",
  )!;
  expect(remove.textContent).toBe("Remove");
  expect(remove.getAttribute("aria-label")).toBe(
    "Remove Example <img src=x> from USB",
  );
  expect(remove.querySelectorAll("svg")).toHaveLength(1);
  expect(
    document.querySelector(".row-action button.secondary svg"),
  ).not.toBeNull();
  expect(document.querySelector("#packages img")).toBeNull();
});
