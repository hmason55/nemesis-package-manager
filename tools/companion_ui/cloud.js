"use strict";
(() => {
  const choices = [];
  let page = 1;
  function compatibility(value) { return "Vehicles: " + (value?.vehicles?.join(", ") || "Not specified") + "; firmware: " + (value?.firmware?.join(", ") || "Not specified") + "; NEMESIS: " + (value?.nemesis || "Not specified"); }
  function row(pkg, versions, folder) {
    const article = textElement("article", "");
    article.append(textElement("h3", pkg.name || pkg.id || pkg.package_id), textElement("p", pkg.description || ""));
    const select = document.createElement("select");
    select.setAttribute("aria-label", "Version for " + (pkg.name || pkg.package_id));
    select.append(...versions.map(v => new Option(v.version, v.version)));
    const check = document.createElement("input"); check.type = "checkbox";
    const label = textElement("label", " Prepare this package "); label.prepend(check);
    const destination = document.createElement("select"); destination.setAttribute("aria-label", "Destination for " + (pkg.id || pkg.package_id));
    const matches = (selected?.packages || []).filter(p => p.id === (pkg.id || pkg.package_id) && p.replaceable && p.kind !== "execute");
    destination.append(new Option(matches.length > 1 ? "Choose USB folder" : "Automatic destination", ""), ...matches.map(p => new Option(p.folder, p.folder)));
    if (folder) destination.value = folder;
    const details = textElement("p", "", "hint");
    function describe() { const v = versions.find(v => v.version === select.value); details.textContent = v ? compatibility(v.compatibility) + "\n" + (v.release_notes || "") : "No comparable newer releases."; }
    select.onchange = describe; describe();
    if (!versions.length) check.disabled = true;
    article.append(label, select, destination, details); $("cloud-packages").append(article);
    choices.push(() => check.checked ? {package_id: pkg.id || pkg.package_id, version: select.value, ...(destination.value ? {folder: destination.value} : {})} : null);
  }
  async function search(next = 1) {
    page = next;
    const result = await api("/api/cloud/packages?" + new URLSearchParams({q: $("cloud-query").value, page: String(page)}));
    choices.length = 0; $("cloud-packages").replaceChildren();
    for (const pkg of result.packages) { const details = await api("/api/cloud/package?id=" + encodeURIComponent(pkg.id)); row(details, details.versions); }
    if (!result.packages.length) $("cloud-packages").append(textElement("p", "No approved packages found."));
    for (const [title, number] of [["Previous", page > 1 ? page - 1 : null], ["Next", result.next_page]]) if (number) { const b = textElement("button", title); b.onclick = () => operation("Loading registry…", () => search(number)); $("cloud-packages").append(b); }
  }
  $("cloud-search").onsubmit = event => { event.preventDefault(); operation("Loading registry…", () => search()); };
  $("cloud-updates").onclick = () => operation("Checking versions on USB…", async () => {
    if (!selected) throw new Error("Select a USB drive first.");
    const result = await api("/api/cloud/updates"); choices.length = 0; $("cloud-packages").replaceChildren();
    for (const pkg of result.updates) { row(pkg, pkg.versions || [], pkg.folder); if (pkg.error) $("cloud-packages").append(textElement("p", pkg.error)); }
  });
  async function watch() {
    const job = await api("/api/cloud/job"); if (!job) return;
    $("cloud-progress").textContent = `${job.status}: ${job.current}\n${job.progress} / ${job.total} bytes\n` + job.results.map(r => `${r.package_id} ${r.version}: ${r.success ? "Prepared on USB" : r.error}`).join("\n");
    if (job.status === "running") setTimeout(() => watch().catch(e => message(e.message, true)), 500);
    else { availability(); await refresh(); message("Cloud preparation finished. Install successful packages in the vehicle."); }
  }
  $("cloud-prepare").onclick = () => operation("Starting cloud preparation…", async () => {
    if (!selected) throw new Error("Select a USB drive first."); const items = choices.map(get => get()).filter(Boolean); if (!items.length) throw new Error("Select at least one package version.");
    if (!confirm("Prepare these package versions on USB? Compatibility requirements are advisory. Existing package data will be kept.")) return;
    await api("/api/cloud/start", {selection_id: selected.selection_id, items}, true); setTimeout(() => watch().catch(e => message(e.message, true)), 500);
  });
  $("cloud-cancel").onclick = () => api("/api/cloud/cancel", {}, true).catch(e => message(e.message, true));
})();
