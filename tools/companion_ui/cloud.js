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
  function row(pkg, versions, folder, saved) {
    const article = textElement("article", "", "cloud-package");
    article.append(labelControl(textElement("h3", ""), pkg.name || pkg.id || pkg.package_id, "package"), textElement("p", pkg.description || "", "cloud-description"));
    if (pkg.publisher || pkg.latest_size) article.append(textElement("p", [pkg.publisher ? "Publisher: " + pkg.publisher : "", pkg.latest_size ? "Latest download: " + NemesisCloudSearch.bytes(pkg.latest_size) : ""].filter(Boolean).join(" · "), "cloud-package-meta"));
    const select = document.createElement("select");
    select.setAttribute("aria-label", "Version for " + (pkg.name || pkg.package_id));
    select.append(...versions.map(v => new Option(v.version, v.version)));
    if (saved && versions.some(version => version.version === saved.version)) select.value = saved.version;
    const check = document.createElement("input"); check.type = "checkbox"; check.checked = !!saved && versions.some(version => version.version === saved.version);
    const label = textElement("label", " Prepare this package "); label.prepend(check);
    const destination = document.createElement("select"); destination.setAttribute("aria-label", "Destination for " + (pkg.id || pkg.package_id));
    const matches = (selected?.packages || []).filter(p => p.id === (pkg.id || pkg.package_id) && p.replaceable && p.kind !== "execute");
    destination.append(new Option(matches.length > 1 ? "Choose USB folder" : "Automatic destination", ""), ...matches.map(p => new Option(p.folder, p.folder)));
    if (folder) destination.value = folder;
    if (saved?.folder && matches.some(match => match.folder === saved.folder)) destination.value = saved.folder;
    const disclosure = document.createElement("details"); disclosure.className = "cloud-version-details";
    disclosure.append(labelControl(textElement("summary", ""), "Version details and compatibility", "info"));
    const details = textElement("p", "", "hint"), warning = textElement("p", "", "cloud-compatibility-note");
    disclosure.append(details);
    function describe() {
      const version = versions.find(value => value.version === select.value);
      const mismatch = version?.compatibility_advice?.some(item => item.state === "mismatch");
      const unknown = !version?.compatibility_advice?.length || version.compatibility_advice.some(item => item.state === "unknown");
      details.textContent = version ? (pkg.description ? pkg.description + "\n\n" : "") + compatibility(version.compatibility) + "\n" + (version.compatibility_advice || []).map(item => item.message).join(" ") + "\nCompatibility is advisory; preparation is still available.\n" + (version.release_notes || "No release notes supplied.") : "No confirmed newer releases. Search to select other versions manually.";
      warning.hidden = !version || (!mismatch && !unknown);
      warning.textContent = mismatch ? "Compatibility mismatch — review details before installing." : "Compatibility unknown — check package details.";
      article.classList.toggle("compatibility-warning", !!mismatch);
    }
    function selectionChanged() { select.hidden = !check.checked; destination.hidden = !check.checked || !selected; }
    check.onchange = () => { selectionChanged(); controls(); };
    select.onchange = describe; describe(); selectionChanged();
    if (!versions.length) check.disabled = true;
    article.append(label, select, destination, warning, disclosure); $("cloud-packages").append(article);
    const choice = () => check.checked ? {package_id: pkg.id || pkg.package_id, version: select.value, ...(destination.value ? {folder: destination.value} : {})} : null;
    choice.retentionKey = NemesisCloudSearch.selectionKey(pkg.id || pkg.package_id, folder);
    choices.push(choice);
  }
  function request(next = 1) {
    const active = [$("cloud-category").value, $("cloud-publisher").value, $("cloud-size").value, $("cloud-sort").value !== "name"].filter(Boolean).length;
    labelControl($("cloud-filter-summary"), active ? `Filter results · ${active} active` : "Filter results", "filter");
    const max = $("cloud-size").value;
    return {q: $("cloud-query").value, category: $("cloud-category").value, publisher: $("cloud-publisher").value, sort: $("cloud-sort").value, page: String(next), ...(max ? {max_size: max} : {}), ...profileQuery()};
  }
  function facets(id, values, label) {
    const select = $(id), previous = select.value;
    select.replaceChildren(new Option(label, ""), ...[...new Set([...(values || []), ...(previous ? [previous] : [])])].map(value => new Option(value, value)));
    select.value = previous;
  }
  const searchControl = NemesisCloudSearch({
    async load(query) {
      if (query.mode === "updates") {
        if (!selected) throw new Error("Select a USB drive first.");
        const result = await api("/api/cloud/updates?" + new URLSearchParams(profileQuery()));
        return {query, result, packages: result.updates};
      }
      const result = await api("/api/cloud/packages?" + new URLSearchParams(query));
      const packages = await Promise.all(result.packages.map(async pkg => {
        try { return {...pkg, ...await api("/api/cloud/package?" + new URLSearchParams({id: pkg.id, vehicle:query.vehicle, firmware:query.firmware, nemesis:query.nemesis}))}; }
        catch (error) { return {...pkg, error: error.message}; }
      }));
      return {query, result, packages};
    },
    render({query, result, packages}) {
      const retained = new Map(choices.map(get => [get.retentionKey, get()]).filter(entry => entry[1]));
      choices.length = 0; $("cloud-packages").replaceChildren(); page = Number(query.page || 1);
      for (const pkg of packages) { row(pkg, pkg.versions || [], pkg.folder, retained.get(NemesisCloudSearch.selectionKey(pkg.id || pkg.package_id, pkg.folder))); if (pkg.error) $("cloud-packages").append(textElement("p", (pkg.id || pkg.package_id) + ": " + pkg.error, "error")); }
      const updates = query.mode === "updates";
      if (!updates) { facets("cloud-category", result.categories, "All categories"); facets("cloud-publisher", result.publishers, "All publishers"); }
      $("cloud-search-status").textContent = updates ? `${NemesisCloudSearch.count(packages.length, "USB package result")}. Select versions manually when ordering is unknown.` : `${NemesisCloudSearch.count(result.total ?? packages.length, "package")} found · page ${page}.`;
      if (!packages.length) $("cloud-packages").append(textElement("p", updates ? "No registry updates found for this USB drive." : "No published packages match. Try clearing the search or resetting filters."));
      if (!updates) for (const [title, number] of [["Previous", page > 1 ? page - 1 : null], ["Next", result.next_page]]) if (number) { const button = labelControl(textElement("button", ""), title, title === "Previous" ? "back" : "next"); button.type = "button"; button.onclick = () => search(number); $("cloud-packages").append(button); }
      controls();
    },
    error(error) { $("cloud-search-status").textContent = "Could not load registry results: " + error.message + " Existing results remain available; retry when connected."; },
    loading(value) { $("cloud-packages").setAttribute("aria-busy", String(value)); if (value) $("cloud-search-status").textContent = "Searching registry…"; },
  });
  function search(next = 1) { return searchControl.now(request(next)); }
  $("cloud-query").addEventListener("input", () => searchControl.queue(request()));
  for (const id of ["cloud-category", "cloud-publisher", "cloud-size", "cloud-sort"]) $(id).onchange = () => search();
  $("cloud-search").onsubmit = event => { event.preventDefault(); search(); };
  $("cloud-clear").onclick = () => { $("cloud-query").value = ""; $("cloud-query").focus(); search(); };
  $("cloud-reset").onclick = () => { $("cloud-search").reset(); search(); };
  $("cloud-updates").onclick = () => searchControl.now({mode:"updates"});
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
    searchControl.invalidate();
    const result = await api("/api/cloud/config", {url: $("registry-url").value.trim()}, true);
    $("cloud-connection").textContent = result.url ? "Registry configured for this Companion session." : "Registry disconnected. Manual ZIP imports remain available.";
    choices.length = 0; $("cloud-packages").replaceChildren(); controls();
  }); };
  $("cloud-profile-apply").onclick = () => {
    try { localStorage.setItem("nemesis-device-profile", JSON.stringify(profileQuery())); } catch (_) { /* Browser storage is optional. */ }
    $("companion-settings").close(); search();
  };
  try { const saved = JSON.parse(localStorage.getItem("nemesis-device-profile") || "{}"); for (const field of profileFields) if (typeof saved[field] === "string") $("profile-" + field).value = saved[field].slice(0, 160); } catch (_) { /* Invalid profile must not break manual imports. */ }
  window.addEventListener("companion-state", () => {
    const next = selected?.selection_id;
    if (searchControl.sourceChanged(next)) {
      choices.length = 0; $("cloud-packages").replaceChildren(); $("cloud-search-status").textContent = "Drive selection changed. Search again to refresh USB destinations.";
    }
    controls();
  });
  api("/api/cloud/config").then(result => { $("registry-url").value = result.url; $("cloud-connection").textContent = result.url ? "Registry configured for browsing." : "Enter a registry HTTPS address. Manual ZIP loading works offline."; controls(); }).catch(error => message(error.message, true));
  poll();
})();
