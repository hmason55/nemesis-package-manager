"use strict";
const $ = (id) => document.getElementById(id);
const token = location.hash.slice(1);
const folderPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const tabNames = ["packages", "import", "setup"];
let selected = null;
let drives = [];
let busy = false;

function message(text, error = false) {
  $("status").textContent = text;
  $("status").classList.toggle("error", error);
}
async function api(path, body, json = false) {
  const headers = { "X-Companion-Token": token };
  if (json) headers["Content-Type"] = "application/json";
  const response = await fetch(path, { method: body === undefined ? "GET" : "POST", headers, body: json ? JSON.stringify(body) : body });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "The operation failed.");
  return result;
}
function availability() {
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
  $("import-note").textContent = update ? "Choose the new release ZIP. Existing data/ is kept." : "The folder name is filled in from the ZIP.";
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
    if (pkg.error) badge.title = pkg.error;
    status.append(badge);
    const action = textElement("td", "", "row-action");
    if (managedPackages().some(item => item.folder === pkg.folder)) {
      const update = textElement("button", "Update", "secondary");
      update.type = "button";
      update.setAttribute("aria-label", `Update ${pkg.name}`);
      update.addEventListener("click", () => beginImport(pkg.folder));
      action.append(update);
    } else action.append(textElement("span", "View only", "hint"));
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
    const manager = drive.manager;
    $("manager-summary").textContent = manager.error ? "Needs attention" : manager.present ? manager.version || "Version unknown" : "Setup needed";
    $("manager-version").textContent = manager.present ? `On USB: ${manager.version || "Unknown"}` : "Setup needed";
    $("manager-detail").textContent = manager.error || (manager.present ? "Update the USB installer. Launcher settings are kept." : "Add Package Manager to this drive. Existing files are kept.");
    $("setup").hidden = manager.present;
    $("update-manager").hidden = !manager.present;
  }
  renderTargets();
  renderPackages();
}
async function refresh() {
  let state;
  try { state = await api("/api/state"); }
  catch (error) {
    $("package-form").reset();
    $("manager-form").reset();
    render(null);
    error.focusTarget = $("drive-select");
    throw error;
  }
  drives = state.drives;
  render(state.drive);
  message(state.drive ? "Drive checked. Ready." : "Select a USB drive to get started.");
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
    message(`Selected ${drive.path}.`);
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
    const error = new Error("Choose a nonempty ZIP no larger than 512 MiB.");
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
    if (overwrite && !managedPackages().some(pkg => pkg.folder === name)) {
      const error = new Error("Choose the package to update.");
      error.focusTarget = $("package-target");
      throw error;
    }
    if (!folderPattern.test(name)) {
      $("folder-settings").open = true;
      const error = new Error("Choose a folder name using 1–64 letters, numbers, dots, hyphens or underscores.");
      error.focusTarget = $("package-name");
      throw error;
    }
    if (overwrite && !confirm(`Update ${name} on ${selected.path}? Existing data/ will be preserved.`)) { message("Update cancelled."); return; }
    const query = new URLSearchParams({ name, overwrite });
    const drive = await api(`/api/package?${query}`, file);
    $("package-filter").value = "all";
    render(drive);
    $("package-form").reset();
    syncImport();
    showTab("packages", true);
    message(overwrite ? "Package installer updated. User data preserved." : "Package added to the drive.");
  });
});
$("manager-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const action = selected.manager.present ? "update-manager" : "setup";
  operation("Copying Package Manager… Keep the drive connected.", async () => {
    const file = validFile($("manager-file"));
    if (!confirm(`${action === "setup" ? "Set up Package Manager" : "Update the Package Manager installer"} on ${selected.path}?`)) { message("Operation cancelled."); return; }
    render(await api(`/api/${action}`, file));
    $("manager-form").reset();
    showTab("packages", true);
    message(action === "setup" ? "Drive prepared. Add packages to get started." : "Manager installer updated on USB. Confirm Update in the vehicle to install it.");
  });
});
if (token) operation("Checking local drives…", refresh);
else message("Open the full session URL printed in the companion's terminal window.", true);
