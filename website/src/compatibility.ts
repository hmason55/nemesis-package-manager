import { el, link } from "./ui";
import { deviceProfile } from "./settings";
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
  const result = advice(declarations, deviceProfile()),
    output = el("div", "", "callout");
  output.append(
    el(
      "strong",
      result.status === "mismatch"
        ? "Compatibility warning"
        : result.status === "match"
          ? "Declared values match"
          : "Compatibility unknown",
    ),
    el(
      "p",
      "Advisory only. Downloads and installation remain available; matching values do not establish hardware support.",
    ),
    link("Change device profile in Settings", "#settings"),
  );
  if (result.status === "mismatch")
    for (const row of result.results.filter((r) => r.status === "mismatch"))
      output.append(el("p", row.field + ": " + row.detail));
  const details = el("details");
  details.append(el("summary", "Comparison details"));
  for (const row of result.results)
    details.append(el("p", row.field + ": " + row.status + " — " + row.detail));
  output.append(details);
  parent.append(output);
}
