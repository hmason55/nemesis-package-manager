import { compatibility } from "./client";
import { profileCheck } from "./compatibility";
import { catalogLink, packageLink } from "./routes";
import {
  el,
  option,
  action,
  link,
  external,
  heading,
  tags,
  selectField,
  size,
  date,
  tabs,
} from "./ui";

export function renderCatalog(
  root: HTMLElement,
  data: any,
  query: string,
  category: string,
  sort: string,
  page: number,
  navigate: (hash: string) => void,
) {
  heading(
    root,
    "Packages",
    "Community packages for NEMESIS. Browse and download without an account.",
  );
  const layout = el("div", "", "catalog-layout"),
    filters = el("aside", "", "filters");
  filters.setAttribute("aria-label", "Package filters");
  const filterControls = el("details");
  filterControls.open =
    !!category || !window.matchMedia("(max-width:760px)").matches;
  filterControls.append(el("summary", "Filter packages"));
  filters.append(filterControls);
  const categorySelect = selectField(filterControls, "Category");
  categorySelect.append(
    option("All categories", ""),
    ...(data.categories || []).map((x: string) => option(x, x)),
  );
  categorySelect.value = category;
  const submit = action(
    "Apply filters",
    () => navigate(catalogLink(query, categorySelect.value, sort)),
    "primary",
  );
  filterControls.append(
    submit,
    link("Clear filters", catalogLink(query), "text-link"),
  );
  const guidance = el("div", "", "help-box");
  guidance.append(
    el("h3", "New to NEMESIS?"),
    el(
      "p",
      "Prepare packages on USB or install through Package Manager in your vehicle.",
    ),
    link("How to use packages", "#help"),
  );
  filters.append(guidance);
  const results = el("div", "", "results"),
    toolbar = el("div", "", "result-toolbar"),
    count = el(
      "p",
      (data.total ?? data.packages.length) +
        " " +
        ((data.total ?? data.packages.length) === 1 ? "package" : "packages") +
        (query ? " matching “" + query + "”" : ""),
    );
  count.setAttribute("role", "status");
  const order = selectField(toolbar, "Sort by");
  order.append(
    option("Package name", "name"),
    option("Recently published", "recent"),
  );
  order.value = sort;
  order.onchange = () => navigate(catalogLink(query, category, order.value));
  toolbar.prepend(count);
  results.append(toolbar);
  const list = el("ul", "", "package-list");
  for (const pkg of data.packages) {
    const row = el("li", "", "package-row"),
      icon = el("div", pkg.name.slice(0, 1).toUpperCase(), "package-icon");
    icon.setAttribute("aria-hidden", "true");
    const body = el("article"),
      h2 = el("h2");
    h2.append(link(pkg.id, packageLink(pkg.id)));
    body.append(
      h2,
      el("p", "by " + (pkg.publisher || pkg.repository), "byline"),
    );
    if (pkg.name !== pkg.id) body.append(el("p", pkg.name, "package-name"));
    const facts = el("p", "", "package-facts");
    if (pkg.latest_published_version)
      facts.append(
        el("span", "Latest published: " + pkg.latest_published_version),
      );
    if (pkg.published_at)
      facts.append(el("span", "Published " + date(pkg.published_at)));
    if (pkg.version_count)
      facts.append(
        el(
          "span",
          pkg.version_count +
            " " +
            (pkg.version_count === 1 ? "version" : "versions"),
        ),
      );
    body.append(
      facts,
      tags(pkg.categories || []),
      el("p", pkg.description, "description"),
    );
    row.append(icon, body);
    list.append(row);
  }
  if (!data.packages.length) {
    const empty = el("div", "", "empty-state");
    empty.append(
      el("h2", "No packages found"),
      el("p", "Try a different search or clear the category filter."),
      link("View all packages", catalogLink()),
    );
    results.append(empty);
  } else results.append(list);
  const pagination = el("nav", "", "pagination");
  pagination.setAttribute("aria-label", "Package result pages");
  if (page > 1)
    pagination.append(
      link(
        "← Previous",
        catalogLink(query, category, sort, page - 1),
        "button-link",
      ),
    );
  pagination.append(el("span", "Page " + page));
  if (data.next_page)
    pagination.append(
      link(
        "Next →",
        catalogLink(query, category, sort, data.next_page),
        "button-link",
      ),
    );
  results.append(pagination);
  layout.append(filters, results);
  root.append(layout);
}

export function renderPackage(
  root: HTMLElement,
  data: any,
  requestedVersion: string,
  navigate: (hash: string) => void,
  notify: (text: string, error?: boolean) => void,
) {
  if (
    requestedVersion &&
    !data.versions.some((value: any) => value.version === requestedVersion)
  ) {
    heading(root, data.id);
    root.append(
      el(
        "p",
        "Version " +
          requestedVersion +
          " is not available. Select an approved version to continue.",
        "callout",
      ),
    );
    const list = el("ul");
    for (const version of data.versions) {
      const row = el("li");
      row.append(link(version.version, packageLink(data.id, version.version)));
      list.append(row);
    }
    root.append(list, link("Back to packages", catalogLink()));
    return;
  }
  const versions: any[] = data.versions,
    selected =
      versions.find((v) => v.version === requestedVersion) || versions[0];
  root.append(link("← Packages", catalogLink(), "back-link"));
  const title = el("div", "", "package-title"),
    icon = el("div", data.name.slice(0, 1).toUpperCase(), "package-icon large");
  icon.setAttribute("aria-hidden", "true");
  const text = el("div");
  heading(text, data.id, data.name !== data.id ? data.name : "");
  text.append(el("p", "by " + data.repository.split("/")[0], "byline"));
  title.append(icon, text);
  root.append(title, tags(data.categories || []));
  const layout = el("div", "", "package-layout"),
    body = el("div"),
    sidebar = el("aside", "", "package-sidebar");
  sidebar.setAttribute("aria-label", "Package metadata");
  const download = el("section", "", "download-box");
  download.append(el("h2", "Get this package"));
  const choose = selectField(download, "Version");
  choose.append(...versions.map((v) => option(v.version, v.version)));
  choose.value = selected.version;
  choose.onchange = () => navigate(packageLink(data.id, choose.value));
  download.append(
    link(
      "Download installer ZIP",
      selected.download_url,
      "button-link primary",
    ),
    el(
      "p",
      size(selected.size) + " · Installed through NEMESIS Package Manager",
      "hint",
    ),
  );
  const copy = action(
    "Copy download link",
    async () => {
      try {
        await navigator.clipboard.writeText(selected.download_url);
        notify("Download link copied.");
      } catch {
        notify(
          "The link could not be copied. Use the download button or your browser’s link menu.",
          true,
        );
      }
    },
    "quiet",
  );
  download.append(copy);
  body.append(download);
  const methods = el("div", "", "install-methods");
  methods.append(
    el("h3", "Choose where to install"),
    el(
      "p",
      "USB companion: download this ZIP, then use Add / update to copy it to your drive. Confirm installation in the vehicle.",
    ),
    el(
      "p",
      "In the vehicle: select Cloud Registry in Package Manager, find this package and version, then download and confirm installation.",
    ),
  );
  body.append(methods);
  const overview = el("section");
  overview.append(
    el("h2", "Overview"),
    el("p", selected.description || data.description, "notes"),
  );
  const requirements = el("section");
  requirements.append(
    el("h2", "Compatibility"),
    el("p", compatibility(selected.compatibility)),
    el(
      "div",
      "Publisher requirements are advisory. Missing information or a matching firmware number does not establish vehicle support.",
      "callout",
    ),
  );
  const notes = el("section");
  profileCheck(requirements, selected.compatibility);
  notes.append(
    el("h2", "Release notes"),
    el(
      "p",
      selected.release_notes ||
        "No release notes were supplied for this version.",
      "notes",
    ),
  );
  const history = el("section");
  history.append(el("h2", "Versions"));
  const table = el("table");
  table.append(el("caption", "Approved package versions"));
  const head = el("thead"),
    headRow = el("tr");
  for (const label of ["Version", "Size", "Action"]) {
    const th = el("th", label);
    th.scope = "col";
    headRow.append(th);
  }
  head.append(headRow);
  const rows = el("tbody");
  for (const version of versions) {
    const row = el("tr"),
      name = el("th");
    name.scope = "row";
    name.textContent = version.version;
    const bytes = el("td", size(version.size)),
      cell = el("td");
    cell.append(
      link(
        version.version === selected.version ? "Selected" : "View version",
        packageLink(data.id, version.version),
      ),
    );
    row.append(name, bytes, cell);
    rows.append(row);
  }
  table.append(head, rows);
  history.append(table);
  tabs(body, [
    { name: "Overview", content: overview },
    { name: "Compatibility", content: requirements },
    { name: "Versions", content: history },
    { name: "Release notes", content: notes },
  ]);
  sidebar.append(
    el("h2", "Package details"),
    el("h3", "Publisher"),
    el("p", data.repository.split("/")[0]),
    el("h3", "Project"),
    external("Source repository", "https://github.com/" + data.repository),
    el("h3", "Package ID"),
    el("p", data.id, "break-word"),
    el("h3", "Approved versions"),
    el("p", String(versions.length)),
  );
  const verification = el("details");
  verification.append(
    el("summary", "Integrity information"),
    el("p", "SHA-256", "hint"),
    el("code", selected.sha256, "hash"),
    el(
      "p",
      "Downloads are checked against the registry-approved artifact.",
      "hint",
    ),
  );
  sidebar.append(verification);
  layout.append(body, sidebar);
  root.append(layout);
}
