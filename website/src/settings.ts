import { el, heading, inputField, selectField, option, action } from "./ui";
import { type Profile } from "./compatibility";
export function deviceProfile(): Profile {
  const profile = { vehicle: "", firmware: "", nemesis: "" };
  try {
    const stored = JSON.parse(
      localStorage.getItem("nemesis-device-profile") || "{}",
    );
    for (const field of Object.keys(profile) as (keyof Profile)[])
      if (typeof stored[field] === "string")
        profile[field] = stored[field].slice(0, 160);
  } catch {}
  return profile;
}
export function renderSettings(root: HTMLElement) {
  heading(
    root,
    "Settings",
    "Optional preferences saved only in this browser. Browsing and downloads work without configuration.",
  );
  const appearance = el("section", "", "settings-card");
  appearance.append(el("h2", "Appearance"));
  const theme = selectField(appearance, "Theme");
  theme.append(
    option("Use device preference", ""),
    option("Dark", "dark"),
    option("Light", "light"),
  );
  try {
    theme.value = localStorage.getItem("nemesis-theme") || "";
  } catch {}
  theme.onchange = () => {
    try {
      if (theme.value) localStorage.setItem("nemesis-theme", theme.value);
      else localStorage.removeItem("nemesis-theme");
    } catch {}
    if (theme.value) document.documentElement.dataset.theme = theme.value;
    else delete document.documentElement.dataset.theme;
    window.dispatchEvent(new Event("nemesis-theme-changed"));
  };
  root.append(appearance);
  const advanced = el("details", "", "settings-card");
  advanced.append(
    el("summary", "Device profile for compatibility comparisons (optional)"),
    el(
      "p",
      "Use exact identifiers from your device. Compatibility is advisory; unknown values and mismatches never block downloads or installation.",
      "hint",
    ),
  );
  const form = el("form"),
    profile = deviceProfile();
  const vehicle = inputField(
      form,
      "Vehicle model",
      "vehicle",
      "text",
      profile.vehicle,
    ),
    firmware = inputField(
      form,
      "Firmware version",
      "firmware",
      "text",
      profile.firmware,
    ),
    nemesis = inputField(
      form,
      "NEMESIS version",
      "nemesis",
      "text",
      profile.nemesis,
    );
  for (const input of [vehicle, firmware, nemesis]) input.maxLength = 160;
  const status = el("p", "", "hint");
  status.setAttribute("role", "status");
  function save() {
    try {
      localStorage.setItem(
        "nemesis-device-profile",
        JSON.stringify({
          vehicle: vehicle.value.trim(),
          firmware: firmware.value.trim(),
          nemesis: nemesis.value.trim(),
        }),
      );
      status.textContent =
        "Device profile saved. Open a package’s Compatibility tab to compare.";
    } catch {
      status.textContent =
        "Browser storage is unavailable. Downloads still work without a profile.";
    }
  }
  form.append(
    action("Save profile", save, "primary"),
    action(
      "Clear profile",
      () => {
        vehicle.value = firmware.value = nemesis.value = "";
        save();
      },
      "quiet",
    ),
    status,
  );
  form.onsubmit = (e) => {
    e.preventDefault();
    save();
  };
  advanced.append(form);
  root.append(advanced);
}
