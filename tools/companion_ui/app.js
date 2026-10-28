"use strict";
const $ = (id) => document.getElementById(id);
const token = location.hash.slice(1);
let selected = null;
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
  $("select-form").querySelectorAll("input, button").forEach((el) => { el.disabled = busy; });
  $("refresh").disabled = busy;
  $("setup").disabled = !!selected?.manager.present;
  $("update-manager").disabled = !selected?.manager.present;
}
async function operation(label, action) {
  if (busy) return;
  busy = true;
  availability();
  message(label);
  try { await action(); }
  catch (error) { message(error.message || "Connection lost. Check the companion's terminal window.", true); }
  finally { busy = false; availability(); }
}
function textElement(tag, text, className) {
  const element = document.createElement(tag);
  element.textContent = text;
  if (className) element.className = className;
  return element;
}
function render(drive) {
  selected = drive;
  $("drive-summary").hidden = !drive;
  $("packages").replaceChildren();
  if (!drive) return;
  $("drive-path").value = drive.path;
  $("selected-path").textContent = drive.path;
  $("space").textContent = `${(drive.free / 1024 ** 3).toFixed(1)} GiB / ${(drive.total / 1024 ** 3).toFixed(1)} GiB`;
  $("launcher").textContent = drive.launcher;
  const manager = drive.manager;
  $("manager-version").textContent = manager.present ? `On USB: ${manager.version || "Unknown"}` : "Setup needed";
  $("manager-detail").textContent = manager.error || (manager.present ? "Manager installer found. Updating replaces only the installer and preserves your launcher settings." : "Prepare this drive with the Package Manager release bundle. Existing unrelated files stay in place.");
  $("package-count").textContent = `${drive.packages.length} package${drive.packages.length === 1 ? "" : "s"}`;
  if (!drive.packages.length) $("packages").append(textElement("p", "No packages yet. Import a release ZIP below to get started.", "empty"));
  for (const pkg of drive.packages) {
    const row = textElement("div", "", "package");
    const details = document.createElement("div");
    details.append(textElement("strong", pkg.name), textElement("code", `${pkg.path || `packages/${pkg.folder}/`} · ${pkg.kind || "Unknown layout"}`));
    if (pkg.description) details.append(textElement("p", pkg.description));
    if (pkg.error) details.append(textElement("p", pkg.error, "issue"));
    const side = document.createElement("div");
    side.append(textElement("div", `On USB: ${pkg.version || "Unknown"}`, "version"));
    const update = textElement("button", "Replace installer", "quiet");
    update.type = "button";
    update.addEventListener("click", () => {
      $("package-name").value = pkg.folder;
      $("overwrite").checked = true;
      $("package-file").focus();
    });
    if (pkg.replaceable !== false) side.append(update);
    else details.append(textElement("p", "Loose ZIP installer. Import a release into a new package folder to manage updates.", "hint"));
    row.append(details, side);
    $("packages").append(row);
  }
}
async function refresh() {
  const state = await api("/api/state");
  $("drives").replaceChildren(...state.drives.map((path) => { const option = document.createElement("option"); option.value = path; return option; }));
  render(state.drive);
  message(state.drive ? "Drive checked. Ready for your next action." : "Choose your USB drive to get started.");
}
$("refresh").addEventListener("click", () => operation("Checking drives…", refresh));
$("select-form").addEventListener("submit", (event) => {
  event.preventDefault();
  operation("Reading drive…", async () => {
    const drive = await api("/api/select", { path: $("drive-path").value.trim() }, true);
    render(drive);
    $("overwrite").checked = false;
    message(`Selected ${drive.path}. Review this path before copying files.`);
  });
});
$("package-file").addEventListener("change", () => {
  if (!$("overwrite").checked) $("package-name").value = ($("package-file").files[0]?.name || "").replace(/\.zip$/i, "").replace(/-usb$/i, "").replace(/[^A-Za-z0-9._-]/g, "-").replace(/^[^A-Za-z0-9]+/, "").slice(0, 64);
});
function validFile(file) {
  if (!file || !file.name.toLowerCase().endsWith(".zip") || !file.size || file.size > 512 * 1024 ** 2) throw new Error("Choose a nonempty ZIP smaller than 512 MiB.");
  return file;
}
$("package-form").addEventListener("submit", (event) => {
  event.preventDefault();
  operation("Importing package… Keep the drive connected until this finishes.", async () => {
    const file = validFile($("package-file").files[0]);
    const name = $("package-name").value;
    const overwrite = $("overwrite").checked;
    if (overwrite && !confirm(`Replace installer files in ${selected.path}/packages/${name}? Existing data/ will be preserved.`)) { message("Import cancelled."); return; }
    const query = new URLSearchParams({ name, overwrite });
    render(await api(`/api/package?${query}`, file));
    $("package-form").reset();
    message("Package imported. Its version on USB is shown below.");
  });
});
$("manager-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const action = event.submitter.value;
  operation("Copying Package Manager… Keep the drive connected until this finishes.", async () => {
    const file = validFile($("manager-file").files[0]);
    if (!confirm(`${action === "setup" ? "Set up Package Manager" : "Replace the Package Manager installer"} on ${selected.path}?`)) { message("Operation cancelled."); return; }
    render(await api(`/api/${action}`, file));
    $("manager-form").reset();
    message(action === "setup" ? "Drive prepared. Add your packages below, then use the drive in your parked vehicle." : "Manager installer updated on USB. Confirm Update in the head-unit app to install it.");
  });
});
if (token) operation("Checking local drives…", refresh);
else message("Open the full session URL printed in the companion's terminal window.", true);
