"use strict";
const $ = (id) => document.getElementById(id);
const token = location.hash.slice(1);
const folderPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const tabNames = ["packages", "import", "setup"];
let selected = null;
let drives = [];
let busy = false;
let managerRelease = null;
let releaseChecking = false;
let removal = null;

// One shared tooltip also covers package actions created after each drive scan.
const tooltip = document.createElement("div");
tooltip.id = "control-tooltip";
tooltip.className = "control-tooltip";
tooltip.setAttribute("role", "tooltip");
tooltip.hidden = true;
document.body.append(tooltip);
let tooltipTarget = null;
let tooltipTimer;
function hideTooltip() {
  clearTimeout(tooltipTimer);
  if (tooltipTarget) {
    const ids = (tooltipTarget.getAttribute("aria-describedby") || "").split(/\s+/).filter(id => id && id !== tooltip.id);
    if (ids.length) tooltipTarget.setAttribute("aria-describedby", ids.join(" "));
    else tooltipTarget.removeAttribute("aria-describedby");
  }
  tooltipTarget = null;
  tooltip.hidden = true;
}
function showTooltip(target, delay = 0) {
  hideTooltip();
  if (!target || target.matches(":disabled")) return;
  tooltipTimer = setTimeout(() => {
    if (!target.isConnected || target.closest("[hidden]")) return;
    tooltipTarget = target;
    tooltip.textContent = target.dataset.tooltip;
    target.setAttribute("aria-describedby", [target.getAttribute("aria-describedby"), tooltip.id].filter(Boolean).join(" "));
    tooltip.hidden = false;
    const bounds = target.getBoundingClientRect();
    const width = tooltip.offsetWidth;
    const height = tooltip.offsetHeight;
    tooltip.style.left = `${Math.max(8, Math.min(bounds.left, window.innerWidth - width - 8))}px`;
    tooltip.style.top = `${Math.max(8, bounds.bottom + height + 14 < window.innerHeight ? bounds.bottom + 8 : bounds.top - height - 8)}px`;
  }, delay);
}
const hints = {
  "drive-select": "Choose the USB drive you will use in the vehicle.",
  refresh: "Check for connected drives and reload the selected drive's packages.",
  "drive-path": "Enter the drive root, such as E:\\ or /media/you/USB.",
  "tab-packages": "View releases on USB. Install them in the vehicle.",
  "tab-import": "Copy a new release to USB or replace an existing installer.",
  "tab-setup": "Add or update the Package Manager installer on USB.",
  "package-filter": "Show all packages, installers, scripts, or packages with an issue.",
  "add-package": "Choose a release ZIP to copy to a new folder on USB.",
  "import-mode": "Add creates a new folder. Update replaces an installer and keeps its data folder.",
  "package-target": "Choose the existing package whose installer you want to replace.",
  "package-file": "Use the downloaded release ZIP. You do not need to extract it first.",
  "package-name": "Use letters, numbers, dots, hyphens, or underscores. Start with a letter or number.",
  "import-submit": "Copy the selected ZIP to USB. Install it in the vehicle afterward.",
  "cancel-import": "Return to the package list without copying files.",
  "manager-file": "Choose usb-package-manager-ready.zip from a trusted Package Manager release.",
  setup: "Copy Package Manager and its launcher to this drive. Existing files are kept.",
  "update-manager": "Copy the manager installer to USB. This does not update the installed app; follow the separate-drive NEMESIS instructions in Drive setup."
};
for (const [id, hint] of Object.entries(hints)) $(id).dataset.tooltip = hint;
$("package-file").setAttribute("aria-describedby", "import-note");
document.addEventListener("pointerover", event => {
  if (event.pointerType === "touch") return;
  if (event.target.closest("#control-tooltip")) { clearTimeout(tooltipTimer); return; }
  const target = event.target.closest("[data-tooltip]");
  if (target && !target.contains(event.relatedTarget)) showTooltip(target, 350);
});
document.addEventListener("pointerout", event => {
  const target = event.target.closest("[data-tooltip], #control-tooltip");
  if (target && !target.contains(event.relatedTarget)) {
    clearTimeout(tooltipTimer);
    tooltipTimer = setTimeout(hideTooltip, 150);
  }
});
document.addEventListener("focusin", event => showTooltip(event.target.closest("[data-tooltip]")));
document.addEventListener("focusout", hideTooltip);
document.addEventListener("keydown", event => { if (event.key === "Escape") hideTooltip(); });
document.addEventListener("click", hideTooltip);
window.addEventListener("resize", hideTooltip);
document.addEventListener("scroll", hideTooltip, true);

function message(text, error = false) {
  $("status").textContent = text;
  $("status").classList.toggle("error", error);
}
async function api(path, body, json = false) {
  const headers = { "X-Companion-Token": token };
  if (body !== undefined) headers["X-Companion-Drive"] = selected?.selection_id || "";
  if (json) headers["Content-Type"] = "application/json";
  const response = await fetch(path, { method: body === undefined ? "GET" : "POST", headers, body: json ? JSON.stringify(body) : body });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "The operation failed.");
  return result;
}
function availability() {
  hideTooltip();
  $("workspace").disabled = busy || !selected;
  $("workspace").setAttribute("aria-busy", String(busy));
  $("select-form").querySelectorAll("input, button").forEach((el) => { el.disabled = busy; });
  $("drive-select").disabled = busy;
  $("refresh").disabled = busy;
}
async function operation(label, action) {
  if (busy) return;
  const previousFocus = document.activeElement;
  let errorTarget;
  busy = true;
  availability();
  message(label);
  try { await action(); }
  catch (error) { message(error.message || "Connection lost. Check the companion's terminal window.", true); errorTarget = error.focusTarget; }
  finally {
    busy = false;
    availability();
    if (errorTarget) errorTarget.focus();
    else if (document.activeElement === document.body && previousFocus?.isConnected && !previousFocus.closest("[hidden]")) previousFocus.focus();
  }
}
function textElement(tag, text, className) {
  const element = document.createElement(tag);
  element.textContent = text;
  if (className) element.className = className;
  return element;
}
function showTab(name, focus = false) {
  hideTooltip();
  for (const tab of tabNames) {
    const active = tab === name;
    $("tab-" + tab).setAttribute("aria-selected", String(active));
    $("tab-" + tab).tabIndex = active ? 0 : -1;
    $("panel-" + tab).hidden = !active;
  }
  if (focus) $("tab-" + name).focus();
}
for (const name of tabNames) {
  $("tab-" + name).addEventListener("click", () => showTab(name));
  $("tab-" + name).addEventListener("keydown", (event) => {
    const index = tabNames.indexOf(name);
    let next;
    if (event.key === "ArrowRight") next = (index + 1) % tabNames.length;
    if (event.key === "ArrowLeft") next = (index + tabNames.length - 1) % tabNames.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = tabNames.length - 1;
    if (next !== undefined) { event.preventDefault(); showTab(tabNames[next], true); }
  });
}
function driveOptions() {
  const paths = [...new Set([...drives, ...(selected ? [selected.path] : [])])];
  $("drive-select").replaceChildren(new Option(paths.length ? "Select a drive…" : "No removable drives detected", ""), ...paths.map(path => new Option(path, path)));
  $("drive-select").value = selected?.path || "";
}
function managedPackages() {
  return (selected?.packages || []).filter(pkg => pkg.replaceable !== false && folderPattern.test(pkg.folder));
}
function syncImport() {
  const update = $("import-mode").value === "update";
  $("target-group").hidden = !update;
  $("new-folder").hidden = update;
  $("import-submit").textContent = update ? "Update package" : "Add package";
  $("import-note").textContent = update ? "Choose the new release ZIP. Your existing data folder is kept." : "Choose the release ZIP you downloaded. The folder name is filled in for you.";
  $("folder-preview").textContent = $("package-name").value ? `packages/${$("package-name").value}/` : "Choose a ZIP first";
}
function renderTargets() {
  const previous = $("package-target").value;
  const packages = managedPackages();
  $("package-target").replaceChildren(new Option("Choose a package…", ""), ...packages.map(pkg => new Option(`${pkg.name} (${pkg.folder})`, pkg.folder)));
  $("package-target").value = packages.some(pkg => pkg.folder === previous) ? previous : "";
  $("update-option").disabled = !packages.length;
  if (!packages.length) $("import-mode").value = "add";
  syncImport();
}
function beginImport(folder = "") {
  $("package-form").reset();
  $("folder-settings").open = false;
  $("import-mode").value = folder ? "update" : "add";
  $("package-target").value = folder;
  syncImport();
  showTab("import");
  $(folder ? "package-file" : "import-mode").focus();
}
function renderPackages() {
  const all = selected?.packages || [];
  const filter = $("package-filter").value;
  const packages = all.filter(pkg => filter === "all" || (filter === "attention" ? !!pkg.error : pkg.kind === filter));
  $("package-count").textContent = String(all.length);
  $("packages").replaceChildren();
  if (!packages.length) {
    const row = document.createElement("tr");
    const cell = textElement("td", !selected ? "Select a drive to view its packages." : all.length ? "No packages match this filter." : "No packages yet. Choose Add package to get started.", "empty");
    cell.colSpan = 5;
    row.append(cell);
    $("packages").append(row);
  }
  for (const pkg of packages) {
    const row = document.createElement("tr");
    const name = document.createElement("td");
    name.append(textElement("strong", pkg.name));
    const details = textElement("details", "", "package-details");
    details.append(textElement("summary", pkg.error ? "View issue" : "Details"));
    if (pkg.id) details.append(textElement("code", pkg.id));
    details.append(textElement("code", pkg.path || `packages/${pkg.folder}/`));
    if (pkg.description) details.append(textElement("p", pkg.description));
    if (pkg.error) details.append(textElement("p", pkg.error, "issue"));
    if (pkg.replaceable === false) details.append(textElement("p", "Loose ZIP installer. Import into a new package folder to manage updates."));
    name.append(details);
    const version = textElement("td", pkg.version || "Unknown", "version");
    version.dataset.label = "On USB";
    const type = textElement("td", ({ install: "Installer", execute: "Script", source: "Source" })[pkg.kind] || "Unknown", "type-column");
    const status = document.createElement("td");
    const badge = textElement("span", pkg.error ? "Needs attention" : "Ready", pkg.error ? "badge attention" : "badge");
    status.append(badge);
    const action = textElement("td", "", "row-action");
    const remove = textElement("button", "Remove", "danger");
    remove.type = "button";
    remove.setAttribute("aria-label", `Remove ${pkg.name} from USB`);
    remove.addEventListener("click", () => {
      removal = pkg;
      $("delete-data").checked = false;
      $("delete-data").disabled = pkg.replaceable === false;
      $("remove-description").textContent = `Remove ${pkg.name} from ${selected.path}?`;
      $("remove-data-note").textContent = pkg.replaceable === false ? "Only this ZIP is removed. Shared data and other installers are kept. Nothing is uninstalled from the head unit." : "Leave unchecked to keep recordings and saved data. This does not uninstall anything from the head unit.";
      $("remove-dialog").showModal();
    });
    if (managedPackages().some(item => item.folder === pkg.folder)) {
      const update = textElement("button", "Replace on USB", "secondary");
      update.type = "button";
      update.setAttribute("aria-label", `Replace ${pkg.name} on USB`);
      update.dataset.tooltip = "Choose a release ZIP to replace this package on USB. Its data folder is kept. This does not check for newer versions.";
      update.addEventListener("click", () => beginImport(pkg.folder));
      action.append(update);
    }
    action.append(remove);
    row.append(name, version, type, status, action);
    $("packages").append(row);
  }
}
function render(drive) {
  selected = drive;
  driveOptions();
  $("drive-summary").hidden = !drive;
  if (drive) {
    $("drive-path").value = drive.path;
    $("space").textContent = `${(drive.free / 1024 ** 3).toFixed(1)} GiB of ${(drive.total / 1024 ** 3).toFixed(1)} GiB`;
    $("launcher").textContent = drive.launcher;
    $("auto-launch").checked = drive.auto_launch.enabled;
    $("auto-launch").disabled = !drive.auto_launch.available;
    const manager = drive.manager;
    $("manager-summary").textContent = manager.error ? "Needs attention" : manager.present ? manager.version || "Version unknown" : "Setup needed";
    $("manager-version").textContent = manager.present ? `On USB: ${manager.version || "Unknown"}` : "Setup needed";
    $("manager-detail").textContent = manager.error || (manager.present ? "Replace the installer on USB. This does not update the installed app. Launcher settings are kept." : "Add Package Manager to this drive. Existing files are kept.");
    const repair = !manager.present && manager.repairable;
    $("setup").hidden = manager.present || repair;
    $("update-manager").hidden = !manager.present && !repair;
    $("update-manager").textContent = repair ? "Repair manager" : "Update manager";
    if (repair) $("manager-detail").textContent = "Restore the missing installer on USB. This does not change the installed app. Existing launcher settings are kept.";
  }
  renderTargets();
  renderPackages();
  renderManagerRelease();
  if (drive && !managerRelease && !releaseChecking) checkManagerRelease();
}
async function refresh() {
  const firstDrive = !selected;
  let state;
  try { state = await api("/api/state"); }
  catch (error) {
    $("package-form").reset();
    $("manager-form").reset();
    render(null);
    error.focusTarget = $("drive-select");
    throw error;
  }
  if (selected && state.drive?.selection_id !== selected.selection_id) {
    $("package-form").reset();
    $("manager-form").reset();
    $("folder-settings").open = false;
  }
  drives = state.drives;
  render(state.drive);
  if (firstDrive && state.drive && !state.drive.manager.present) showTab("setup");
  message(!state.drive ? "Select a USB drive to get started." : state.drive.manager.present ? "Drive checked. Ready to add or update packages." : "Drive selected. Open Drive setup to add Package Manager.");
}
function chooseDrive(path) {
  if (!path) { driveOptions(); return; }
  operation("Reading drive…", async () => {
    let drive;
    try { drive = await api("/api/select", { path }, true); }
    catch (error) { driveOptions(); throw error; }
    $("package-form").reset();
    $("manager-form").reset();
    $("folder-settings").open = false;
    $("package-filter").value = "all";
    $("manual-drive").open = false;
    render(drive);
    showTab(drive.manager.present ? "packages" : "setup", true);
    message(drive.manager.present ? "Drive selected. Ready to add or update packages." : "Drive selected. Add Package Manager in Drive setup.");
  });
}
$("refresh").addEventListener("click", () => operation("Checking drives…", refresh));
$("drive-select").addEventListener("change", () => chooseDrive($("drive-select").value));
$("select-form").addEventListener("submit", (event) => { event.preventDefault(); chooseDrive($("drive-path").value.trim()); });
$("package-filter").addEventListener("change", renderPackages);
$("add-package").addEventListener("click", () => beginImport());
$("cancel-import").addEventListener("click", () => showTab("packages", true));
$("import-mode").addEventListener("change", () => { $("package-file").value = ""; syncImport(); });
$("package-target").addEventListener("change", () => { $("package-file").value = ""; });
$("package-name").addEventListener("input", syncImport);
$("package-file").addEventListener("change", () => {
  if ($("import-mode").value === "add") $("package-name").value = ($("package-file").files[0]?.name || "").replace(/\.zip$/i, "").replace(/-usb$/i, "").replace(/[^A-Za-z0-9._-]/g, "-").replace(/^[^A-Za-z0-9]+/, "").slice(0, 64);
  syncImport();
});
function validFile(input) {
  const file = input.files[0];
  if (!file || !file.name.toLowerCase().endsWith(".zip") || !file.size || file.size > 512 * 1024 ** 2) {
    const error = new Error(!file ? "Choose a release ZIP first." : !file.name.toLowerCase().endsWith(".zip") ? "Choose a ZIP file. Leave it compressed." : !file.size ? "This ZIP is empty. Download the release again." : "This ZIP is too large. Choose a smaller release ZIP.");
    error.focusTarget = input;
    throw error;
  }
  return file;
}
$("package-form").addEventListener("submit", (event) => {
  event.preventDefault();
  operation("Copying package… Keep the drive connected.", async () => {
    const file = validFile($("package-file"));
    const overwrite = $("import-mode").value === "update";
    const name = overwrite ? $("package-target").value : $("package-name").value;
    const target = overwrite ? managedPackages().find(pkg => pkg.folder === name) : null;
    if (overwrite && !target) {
      const error = new Error("Choose the package to update.");
      error.focusTarget = $("package-target");
      throw error;
    }
    if (!folderPattern.test(name)) {
      $("folder-settings").open = true;
      const error = new Error("Use 1–64 letters, numbers, dots, hyphens, or underscores. Start with a letter or number.");
      error.focusTarget = $("package-name");
      throw error;
    }
    if (overwrite && !confirm(`Replace the installer for ${target.name} on ${selected.path}?\n\nYour existing data folder will be kept.`)) { message("Update cancelled."); return; }
    const query = new URLSearchParams({ name, overwrite });
    const drive = await api(`/api/package?${query}`, file);
    $("package-filter").value = "all";
    render(drive);
    $("package-form").reset();
    syncImport();
    showTab("packages", true);
    const nextAction = drive.packages.find(pkg => pkg.folder === name)?.kind === "execute" ? "Run script" : overwrite ? "Update" : "Install";
    message(`${overwrite ? "Installer updated" : "Package added"} on USB. In the vehicle, tap Refresh, then ${nextAction}.${overwrite ? " Your data folder was kept." : ""}`);
  });
});
$("manager-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const action = selected.manager.present || selected.manager.repairable ? "update-manager" : "setup";
  operation("Copying Package Manager… Keep the drive connected.", async () => {
    const file = validFile($("manager-file"));
    if (!confirm(`${action === "setup" ? "Set up Package Manager" : "Update the Package Manager installer"} on ${selected.path}?`)) { message("Operation cancelled."); return; }
    render(await api(`/api/${action}`, file));
    $("manager-form").reset();
    const guide = $("manager-update-guide");
    guide.open = action !== "setup";
    showTab(action === "setup" ? "packages" : "setup", true);
    message(action === "setup" ? "Drive prepared. Add packages, then safely eject and approve the NEMESIS prompt in the vehicle for first installation." : "Manager installer copied to USB. This does not update the installed app. Follow the separate-drive NEMESIS instructions below to install it.");
    if (guide.open) guide.querySelector("summary").focus();
  });
});


function numericVersion(value) {
  const match = (value || "").match(/^v?(\d+(?:\.\d+)*)(?:-build\.(\d+))?$/);
  if (!match) return null;
  const parts = match[1].split(".").map(Number);
  while (parts.length < 3) parts.push(0);
  return [...parts, Number(match[2] || 0)];
}
function renderManagerRelease() {
  const link = $("manager-release-link");
  link.hidden = true;
  if (!managerRelease) return;
  if (managerRelease.error) { $("release-status").textContent = managerRelease.error; return; }
  const current = numericVersion(selected?.manager?.version);
  const latest = numericVersion(managerRelease.version);
  const newer = current && latest && latest.some((n, i) => n !== (current[i] || 0) && latest.slice(0, i).every((v, j) => v === (current[j] || 0)) && n > (current[i] || 0));
  $("release-status").textContent = newer ? `Update available: ${managerRelease.version}${managerRelease.prerelease ? " (prerelease)" : ""}` : !current ? `Latest release: ${managerRelease.version}. USB version could not be compared.` : `Latest release: ${managerRelease.version}. No newer release found.`;
  link.textContent = newer ? "Get the newer manager release" : "View release";
  link.href = managerRelease.url;
  link.hidden = !newer && !!current;
}
async function checkManagerRelease() {
  if (releaseChecking) return;
  releaseChecking = true;
  $("check-release").disabled = true;
  $("release-status").textContent = "Checking published releases…";
  try { managerRelease = await api("/api/manager-release"); }
  catch (_) { managerRelease = {error: "Release check unavailable. USB management works offline."}; }
  finally { releaseChecking = false; $("check-release").disabled = false; renderManagerRelease(); }
}
$("check-release").addEventListener("click", checkManagerRelease);
$("auto-launch").addEventListener("change", () => {
  const enabled = $("auto-launch").checked;
  operation("Changing USB launch setting…", async () => {
    try { render(await api("/api/launcher", {enabled}, true)); message(enabled ? "Automatic USB launch enabled." : "Automatic USB launch disabled."); }
    catch (error) { $("auto-launch").checked = selected.auto_launch.enabled; throw error; }
  });
});
$("cancel-remove").addEventListener("click", () => $("remove-dialog").close());
$("remove-form").addEventListener("submit", event => {
  event.preventDefault();
  const pkg = removal;
  const deleteData = $("delete-data").checked;
  $("remove-dialog").close();
  operation("Removing package from USB…", async () => {
    render(await api("/api/remove", {path: pkg.path.replace(/\/$/, ""), delete_data: deleteData}, true));
    message(deleteData ? "Package and its USB data removed." : "Package removed. USB data was kept.");
  });
});
if (token) operation("Checking local drives…", refresh);
else message("Open the full session URL printed in the companion's terminal window.", true);
