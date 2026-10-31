"use strict";
(() => {
  const choices = [];
  $("open-settings").onclick = () => $("companion-settings").showModal();
  $("close-settings").onclick = () => $("companion-settings").close();
  let page = 1;
  const profileFields = ["vehicle", "firmware", "nemesis"];
  function profileQuery() { return Object.fromEntries(profileFields.map(field => [field, $("profile-" + field).value.trim()])); }
  function controls() {
    const count = choices.filter(get => get()).length;
    $("cloud-selection").textContent = `${count} package version${count === 1 ? "" : "s"} selected. ` + (selected ? "A USB drive is selected." : "Select a USB drive before preparing packages.");
    $("cloud-prepare").disabled = !selected || !count || busy || cloudRunning;
    $("cloud-cancel").disabled = !cloudRunning;
    $("cloud-config").querySelectorAll("input, button").forEach(node => node.disabled = cloudRunning || busy);
  }
  function compatibility(value) { return "Vehicles: " + (value?.vehicles?.join(", ") || "Not specified") + "; firmware: " + (value?.firmware?.join(", ") || "Not specified") + "; NEMESIS: " + (value?.nemesis || "Not specified"); }
  function row(pkg, versions, folder) {
    const article = textElement("article", "", "cloud-package");
    article.append(textElement("h3", pkg.name || pkg.id || pkg.package_id), textElement("p", pkg.description || ""));
    const select = document.createElement("select");
    select.setAttribute("aria-label", "Version for " + (pkg.name || pkg.package_id));
    select.append(...versions.map(v => new Option(v.version, v.version)));
    const check = document.createElement("input"); check.type = "checkbox"; check.onchange = controls;
    const label = textElement("label", " Prepare this package "); label.prepend(check);
    const destination = document.createElement("select"); destination.setAttribute("aria-label", "Destination for " + (pkg.id || pkg.package_id));
    const matches = (selected?.packages || []).filter(p => p.id === (pkg.id || pkg.package_id) && p.replaceable && p.kind !== "execute");
    destination.append(new Option(matches.length > 1 ? "Choose USB folder" : "Automatic destination", ""), ...matches.map(p => new Option(p.folder, p.folder)));
    if (folder) destination.value = folder;
    const details = textElement("p", "", "hint");
    function describe() { const v = versions.find(v => v.version === select.value); details.textContent = v ? compatibility(v.compatibility) + "\n" + (v.compatibility_advice || []).map(item => item.message).join(" ") + "\nCompatibility is advisory; preparation is still available.\n" + (v.release_notes || "") : "No confirmed newer releases. Search to select other versions manually."; article.classList.toggle("compatibility-warning", !!v?.compatibility_advice?.some(item => item.state === "mismatch")); }
    select.onchange = describe; describe();
    if (!versions.length) check.disabled = true;
    article.append(label, select, destination, details); $("cloud-packages").append(article);
    choices.push(() => check.checked ? {package_id: pkg.id || pkg.package_id, version: select.value, ...(destination.value ? {folder: destination.value} : {})} : null);
  }
  async function search(next = 1) {
    page = next;
    const result = await api("/api/cloud/packages?" + new URLSearchParams({q: $("cloud-query").value, page: String(page)}));
    choices.length = 0; $("cloud-packages").replaceChildren();
    for (const pkg of result.packages) { const details = await api("/api/cloud/package?" + new URLSearchParams({id: pkg.id, ...profileQuery()})); row(details, details.versions); }
    controls();
    if (!result.packages.length) $("cloud-packages").append(textElement("p", "No published packages found."));
    for (const [title, number] of [["Previous", page > 1 ? page - 1 : null], ["Next", result.next_page]]) if (number) { const b = textElement("button", title); b.onclick = () => operation("Loading registry…", () => search(number)); $("cloud-packages").append(b); }
  }
  $("cloud-search").onsubmit = event => { event.preventDefault(); operation("Loading registry…", () => search()); };
  $("cloud-updates").onclick = () => operation("Checking versions on USB…", async () => {
    if (!selected) throw new Error("Select a USB drive first.");
    const result = await api("/api/cloud/updates?" + new URLSearchParams(profileQuery())); choices.length = 0; $("cloud-packages").replaceChildren();
    for (const pkg of result.updates) { row(pkg, pkg.versions || [], pkg.folder); if (pkg.error) $("cloud-packages").append(textElement("p", pkg.error)); }
    if (!result.updates.length) $("cloud-packages").append(textElement("p", "No registry updates found for this USB drive."));
    controls();
  });
  async function watch() {
    const job = await api("/api/cloud/job"); cloudRunning = job?.status === "running"; availability(); controls(); if (!job) return;
    $("cloud-meter").hidden = !cloudRunning; $("cloud-meter").max = Math.max(1, job.total); $("cloud-meter").value = job.progress;
    $("cloud-progress").textContent = `${job.status}: ${job.current}\n${job.progress} / ${job.total} bytes\n` + job.results.map(r => `${r.package_id} ${r.version}: ${r.success ? "Prepared on USB" : r.error}`).join("\n");
    if (job.status === "running") setTimeout(poll, 500);
    else { await refresh(); message("Preparation completed. Review each package result above. Install successfully prepared packages in the vehicle."); }
  }
  function poll() { watch().catch(error => { message("Download status unavailable; reconnecting. " + error.message, true); setTimeout(poll, 2000); }); }
  $("cloud-prepare").onclick = () => operation("Starting cloud preparation…", async () => {
    if (!selected) throw new Error("Select a USB drive first."); const items = choices.map(get => get()).filter(Boolean); if (!items.length) throw new Error("Select at least one package version.");
    for (const item of items) if (!item.folder && selected.packages.filter(pkg => pkg.id === item.package_id && !pkg.error).length > 1) throw new Error("Choose a USB destination folder for " + item.package_id + " before preparing this batch.");
    if (!confirm("Prepare these package versions on USB? Review compatibility above. Mismatches and unknown support are advisory. Existing package data will be kept.")) return;
    await api("/api/cloud/start", {selection_id: selected.selection_id, items}, true); cloudRunning = true; setTimeout(poll, 500);
  });
  $("cloud-cancel").onclick = () => api("/api/cloud/cancel", {}, true).then(() => message("Cancellation requested. An active USB replacement finishes safely before stopping.")).catch(e => message(e.message, true));
  $("cloud-config").onsubmit = event => { event.preventDefault(); operation("Connecting registry…", async () => {
    const result = await api("/api/cloud/config", {url: $("registry-url").value.trim()}, true);
    $("cloud-connection").textContent = result.url ? "Registry configured for this Companion session." : "Registry disconnected. Manual ZIP imports remain available.";
    choices.length = 0; $("cloud-packages").replaceChildren(); controls();
  }); };
  $("cloud-profile-apply").onclick = () => {
    try { localStorage.setItem("nemesis-device-profile", JSON.stringify(profileQuery())); } catch (_) { /* Browser storage is optional. */ }
    $("companion-settings").close(); operation("Updating compatibility advice…", () => search());
  };
  try { const saved = JSON.parse(localStorage.getItem("nemesis-device-profile") || "{}"); for (const field of profileFields) if (typeof saved[field] === "string") $("profile-" + field).value = saved[field].slice(0, 160); } catch (_) { /* Invalid profile must not break manual imports. */ }
  window.addEventListener("companion-state", controls);
  api("/api/cloud/config").then(result => { $("registry-url").value = result.url; $("cloud-connection").textContent = result.url ? "Registry configured for browsing." : "Enter a registry HTTPS address. Manual ZIP loading works offline."; controls(); }).catch(error => message(error.message, true));
  poll();
})();
