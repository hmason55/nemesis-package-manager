import { API, api, setToken } from "./client";
import { parseRoute, catalogLink } from "./routes";
import { el, action, link, external, heading } from "./ui";
import { renderCatalog, renderPackage } from "./catalog-view";
import { renderPublish, statusLabels } from "./publish-view";
const $ = (id: string) => document.getElementById(id)!;
let user: any = null,
  generation = 0;
function notify(text: string, error = false) {
  const node = $("notice");
  node.textContent = text;
  node.className = error ? "error" : "";
  node.setAttribute("role", error ? "alert" : "status");
}
async function run(task: () => Promise<unknown>) {
  try {
    notify("");
    await task();
  } catch (error) {
    notify(
      error instanceof Error
        ? error.message
        : "The request could not be completed. Please try again.",
      true,
    );
  }
}
function clearUser() {
  setToken("");
  user = null;
  $("signin").hidden = false;
  $("signout").hidden = true;
  $("moderate").hidden = true;
}
async function signin() {
  if (!API)
    throw new Error(
      "The registry is not available yet. Please try again later.",
    );
  const verifier = Array.from(crypto.getRandomValues(new Uint8Array(32)), (x) =>
    x.toString(16).padStart(2, "0"),
  ).join("");
  sessionStorage.setItem("nemesis_verifier", verifier);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  const challenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  location.assign(
    API + "/auth/start?challenge=" + encodeURIComponent(challenge),
  );
}
function navigate(hash: string) {
  if (location.hash === hash) void run(renderRoute);
  else location.hash = hash;
}
async function renderRoute() {
  const token = ++generation,
    route = parseRoute(location.hash),
    root = $("content");
  root.replaceChildren(el("p", "Loading…", "loading"));
  root.setAttribute("aria-busy", "true");
  for (const id of ["browse", "publish", "moderate", "help"]) {
    const node = $(id);
    if (
      (route.page === "package" && id === "browse") ||
      (route.page === "packages" && id === "browse") ||
      route.page === id
    )
      node.setAttribute("aria-current", "page");
    else node.removeAttribute("aria-current");
  }
  const target = el("div", "", "page-content");
  try {
    if (route.page === "packages") {
      ($("search-query") as HTMLInputElement).value = route.query;
      const data = await api(
        "/v1/packages?" +
          new URLSearchParams({
            q: route.query,
            category: route.category,
            sort: route.sort,
            page: String(route.number),
          }),
      );
      if (token !== generation) return;
      renderCatalog(
        target,
        data,
        route.query,
        route.category,
        route.sort,
        route.number,
        navigate,
      );
    } else if (route.page === "package") {
      const data = await api("/v1/packages/" + encodeURIComponent(route.id));
      if (token !== generation) return;
      renderPackage(target, data, route.version, navigate, notify);
    } else if (route.page === "publish") {
      await renderPublish(target, user, {
        run,
        notify,
        active: () => token === generation,
        signin,
        refresh: renderRoute,
      });
    } else if (route.page === "moderate") {
      if (!user?.admin)
        throw new Error(
          "Sign in with an administrator account to review submissions.",
        );
      const submissions = await api("/v1/admin/submissions");
      if (token !== generation) return;
      heading(
        target,
        "Review submissions",
        "Validation results and package ownership must be reviewed before a version is published.",
      );
      for (const submission of submissions) {
        const data = JSON.parse(submission.metadata),
          card = el("article", "", "review-card");
        card.append(
          el("h2", submission.package_id + " " + submission.version),
          el(
            "span",
            statusLabels[submission.status] || submission.status,
            "status-badge",
          ),
          el(
            "p",
            submission.repository +
              " · " +
              (submission.publisher || "GitHub release synchronization"),
          ),
          el("p", data.description),
          el("p", submission.report || "Waiting for validation"),
          external(
            "Inspect source and releases",
            "https://github.com/" + submission.repository + "/releases",
          ),
        );
        const integrity = el("details");
        integrity.append(
          el("summary", "Metadata and artifact identity"),
          el("pre", JSON.stringify(data, null, 2), "notes"),
          el("code", submission.sha256 || "No validated artifact yet", "hash"),
        );
        card.append(integrity);
        const actions = el("div", "", "actions");
        const allowed =
          submission.status === "review"
            ? ["approve", "reject"]
            : submission.status === "approved"
              ? ["withdraw"]
              : submission.status === "failed"
                ? ["retry", "reject"]
                : ["queued", "validating"].includes(submission.status)
                  ? ["reject"]
                  : [];
        for (const operation of allowed)
          actions.append(
            action(
              operation[0].toUpperCase() + operation.slice(1),
              () =>
                run(async () => {
                  if (
                    !confirm(
                      operation +
                        " " +
                        submission.package_id +
                        " " +
                        submission.version +
                        "?",
                    )
                  )
                    return;
                  const reason =
                    operation === "approve"
                      ? ""
                      : prompt("Reason for this action");
                  if (reason === null) return;
                  await api(
                    "/v1/admin/submissions/" + submission.id + "/" + operation,
                    { reason },
                  );
                  await renderRoute();
                }),
              operation === "approve" ? "primary" : "quiet",
            ),
          );
        card.append(actions);
        target.append(card);
      }
    } else {
      heading(
        target,
        "Using NEMESIS packages",
        "Choose the workflow that fits your vehicle’s connection. Browsing and downloading never requires an account.",
      );
      const sections = [
        [
          "Prepare a USB drive",
          "Open the USB companion on your computer. Set up your drive if needed, then browse Cloud Registry or import a downloaded ZIP. The companion keeps package data when replacing an installer. In the parked vehicle, open Package Manager, select USB Storage, and confirm installation.",
        ],
        [
          "Install from the vehicle",
          "With NEMESIS already installed, open Package Manager and select Cloud Registry. Choose a package and version, read its vehicle and firmware requirements, then download it. Package Manager verifies the download and asks you to confirm before running NEMESIS.",
        ],
        [
          "Check compatibility",
          "Requirements are supplied by package publishers. Read the supported vehicles, firmware, and NEMESIS versions for the release you choose. Unknown compatibility and mismatches are advisory; they are not a guarantee of support.",
        ],
        [
          "Publish your own package",
          "Sign in with GitHub, connect a public repository you can manage, and select a GitHub Release installer ZIP. Review its package identity, version, and requirements before submitting it. Every version passes validation and maintainer review before publication.",
        ],
      ];
      for (const [title, body] of sections) {
        const section = el("section", "", "guide-section");
        section.append(el("h2", title), el("p", body));
        target.append(section);
      }
      target.append(
        external(
          "Full user guide",
          "https://github.com/hmason55/nemesis-package-manager/blob/main/docs/USER-GUIDE.md",
        ),
        link("Browse packages", catalogLink(), "button-link primary"),
      );
    }
    if (token !== generation) return;
    root.replaceChildren(target);
    root.focus({ preventScroll: true });
  } catch (error) {
    if (token !== generation) return;
    root.replaceChildren(
      el("h1", "This page could not be loaded"),
      el(
        "p",
        error instanceof Error ? error.message : "The registry is unavailable.",
      ),
      action("Try again", () => run(renderRoute), "primary"),
      link("Package help", "#help", "text-link"),
    );
    notify("The registry request could not be completed.", true);
  } finally {
    if (token === generation) root.setAttribute("aria-busy", "false");
  }
}
$("search").onsubmit = (event) => {
  event.preventDefault();
  navigate(catalogLink(($("search-query") as HTMLInputElement).value.trim()));
};
$("signin").onclick = () => void run(signin);
$("signout").onclick = () =>
  void run(async () => {
    try {
      await api("/auth/logout", {});
    } finally {
      clearUser();
    }
    await renderRoute();
  });
window.addEventListener("registry-session-expired", () => {
  clearUser();
  if (["publish", "moderate"].includes(parseRoute(location.hash).page))
    void run(renderRoute);
});
window.addEventListener("hashchange", () => void run(renderRoute));
function theme() {
  let choice = "";
  try {
    choice = localStorage.getItem("nemesis-theme") || "";
  } catch {}
  if (choice) document.documentElement.dataset.theme = choice;
  const dark = choice
    ? choice === "dark"
    : window.matchMedia("(prefers-color-scheme: dark)").matches;
  $("theme").textContent = dark ? "Use light theme" : "Use dark theme";
  return dark;
}
$("theme").onclick = () => {
  const choice = theme() ? "light" : "dark";
  document.documentElement.dataset.theme = choice;
  try {
    localStorage.setItem("nemesis-theme", choice);
  } catch {}
  theme();
};
theme();
void run(async () => {
  const code = new URLSearchParams(location.hash.slice(1)).get("auth_code");
  if (code) {
    history.replaceState(null, "", location.pathname + "#publish");
    const verifier = sessionStorage.getItem("nemesis_verifier");
    sessionStorage.removeItem("nemesis_verifier");
    const result = await api("/auth/exchange", { code, verifier });
    setToken(result.token);
    user = await api("/v1/publisher/me");
    $("signin").hidden = true;
    $("signout").hidden = false;
    $("moderate").hidden = !user.admin;
  }
  await renderRoute();
});
