import { el, inputField, action } from "./ui";
export type Profile = { vehicle: string; firmware: string; nemesis: string };
export function advice(declarations: any, profile: Profile) {
  const results = (
    [
      ["Vehicle", declarations?.vehicles || [], profile.vehicle],
      ["Firmware", declarations?.firmware || [], profile.firmware],
      [
        "NEMESIS",
        declarations?.nemesis ? [declarations.nemesis] : [],
        profile.nemesis,
      ],
    ] as [string, string[], string][]
  ).map(([field, values, known]) => {
    const accepted = values.map((v) => v.trim().toLowerCase()).filter(Boolean);
    if (accepted.includes("*"))
      return { field, status: "match", detail: "Any value declared" };
    if (!accepted.length || !known.trim())
      return {
        field,
        status: "unknown",
        detail: "Requirement or profile not specified",
      };
    if (accepted.includes(known.trim().toLowerCase()))
      return { field, status: "match", detail: known };
    if (
      accepted.some(
        (v) =>
          v === "x" ||
          /[<>+*]|\b(or|and|to|later|newer|above|below|latest|all|tested|compatible)\b|\d\.x|\s-\s/.test(
            v,
          ),
      )
    )
      return {
        field,
        status: "unknown",
        detail: "Free-form requirement; check publisher instructions",
      };
    return {
      field,
      status: "mismatch",
      detail: known + "; publisher declares " + values.join(", "),
    };
  });
  return {
    status: results.some((r) => r.status === "mismatch")
      ? "mismatch"
      : results.some((r) => r.status === "unknown")
        ? "unknown"
        : "match",
    results,
  };
}
export function profileCheck(parent: HTMLElement, declarations: any) {
  const details = el("details");
  details.append(el("summary", "Compare with your device (optional)"));
  const form = el("form");
  let saved: Profile = { vehicle: "", firmware: "", nemesis: "" };
  try {
    saved = {
      ...saved,
      ...JSON.parse(localStorage.getItem("nemesis-device-profile") || "{}"),
    };
  } catch {}
  const vehicle = inputField(
      form,
      "Vehicle model",
      "vehicle",
      "text",
      saved.vehicle,
    ),
    firmware = inputField(
      form,
      "Firmware version",
      "firmware",
      "text",
      saved.firmware,
    ),
    nemesis = inputField(
      form,
      "NEMESIS version",
      "nemesis",
      "text",
      saved.nemesis,
    );
  form.append(
    el(
      "p",
      "Saved only in this browser. Exact values and * can be compared; free-form ranges may remain unknown.",
      "hint",
    ),
  );
  const output = el("div", "", "callout");
  output.setAttribute("role", "status");
  function compare() {
    const profile = {
      vehicle: vehicle.value,
      firmware: firmware.value,
      nemesis: nemesis.value,
    };
    try {
      localStorage.setItem("nemesis-device-profile", JSON.stringify(profile));
    } catch {}
    const result = advice(declarations, profile);
    output.replaceChildren(
      el(
        "strong",
        result.status === "mismatch"
          ? "Compatibility warning"
          : result.status === "unknown"
            ? "Compatibility unknown"
            : "Declared values match",
      ),
      el(
        "p",
        "Advisory only. Downloads and installation remain available; matching values do not establish hardware support.",
      ),
    );
    for (const row of result.results)
      output.append(
        el("p", row.field + ": " + row.status + " — " + row.detail),
      );
  }
  form.append(action("Compare requirements", compare, "primary"), output);
  form.onsubmit = (e) => {
    e.preventDefault();
    compare();
  };
  details.append(form);
  parent.append(details);
  compare();
}
