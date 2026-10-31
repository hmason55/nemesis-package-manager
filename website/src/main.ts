import { renderSettings } from "./settings";
import { renderManagement } from "./management";
import { searchControl } from "./search-control";
import { icon, labelAction } from "./icons";
import { renderGuides } from "./guides";
import { API, api, setToken, hasSession } from "./client";
import { parseRoute, catalogLink } from "./routes";
import { el, action, link, external, heading } from "./ui";
import { renderCatalog, renderPackage } from "./catalog-view";
import { renderPublish, statusLabels } from "./publish-view";
const $ = (id: string) => document.getElementById(id)!;
let user: any = null,
  generation = 0;
let activeRouteHash = "";
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
async function renderRoute(preserveFocus = false) {
  activeRouteHash = location.hash;
  const focused = document.activeElement as HTMLElement | null;
  const control = focused?.dataset.catalogControl;
  const token = ++generation,
    route = parseRoute(location.hash),
    root = $("content");
  const filterOpen = preserveFocus
    ? root.querySelector<HTMLDetailsElement>("[data-catalog-filters]")?.open
    : undefined;
  if (!preserveFocus) root.replaceChildren(el("p", "Loading…", "loading"));
  $("search-status").textContent = "Loading packages…";
  root.setAttribute("aria-busy", "true");
  for (const id of ["browse", "publish", "moderate", "help", "settings"]) {
    const node = $(id);
    if (
      (route.page === "package" && id === "browse") ||
      (route.page === "packages" && id === "browse") ||
      (route.page === "guides" && id === "help") ||
      route.page === id
    )
      node.setAttribute("aria-current", "page");
    else node.removeAttribute("aria-current");
  }
  const target = el("div", "", "page-content");
  try {
    if (route.page === "packages") {
      if (!preserveFocus || document.activeElement !== $("search-query"))
        ($("search-query") as HTMLInputElement).value = route.query;
      searchBox.updateClear();
      const data = await api(
        "/v1/packages?" +
          new URLSearchParams({
            q: route.query,
            category: route.category,
            sort: route.sort,
            page: String(route.number),
            publisher: route.publisher,
            max_size: route.maxSize,
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
        liveNavigate,
        { publisher: route.publisher, maxSize: route.maxSize, filterOpen },
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
          "Sign in with an administrator account to manage registry submissions.",
        );
      const [submissions, blocks] = await Promise.all([
        api("/v1/admin/submissions"),
        api("/v1/admin/blocks"),
      ]);
      if (token !== generation) return;
      renderManagement(target, submissions, blocks, {
        run,
        refresh: renderRoute,
      });
    } else if (route.page === "settings") {
      renderSettings(target);
    } else {
      renderGuides(target, route.page === "guides" ? route.id : "");
    }
    if (token !== generation) return;
    root.replaceChildren(target);
    if (!preserveFocus) root.focus({ preventScroll: true });
    else if (control)
      root
        .querySelector<HTMLElement>('[data-catalog-control="' + control + '"]')
        ?.focus({ preventScroll: true });
    $("search-status").textContent =
      route.page === "packages" ? "Results updated." : "";
    if (
      route.page === "guides" &&
      Number.isSafeInteger(route.section) &&
      route.section > 0
    ) {
      const section = root.querySelector<HTMLElement>(
        "#guide-section-" + route.section,
      );
      if (section) {
        section.tabIndex = -1;
        section.focus();
        section.scrollIntoView();
      }
    }
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
    $("search-status").textContent =
      "Search could not be completed. Try again.";
    notify("The registry request could not be completed.", true);
  } finally {
    if (token === generation) root.setAttribute("aria-busy", "false");
  }
}
function liveNavigate(hash: string) {
  searchBox.cancel();
  const next = parseRoute(hash);
  if (next.page === "packages")
    hash = catalogLink(
      ($("search-query") as HTMLInputElement).value.trim(),
      next.category,
      next.sort,
      next.number,
      next.publisher,
      next.maxSize,
    );
  history.replaceState(null, "", location.pathname + location.search + hash);
  void run(() => renderRoute(true));
}
const searchBox = searchControl(
  $("search-query") as HTMLInputElement,
  $("search") as HTMLFormElement,
  $("search-clear") as HTMLButtonElement,
  () => {
    generation++;
    $("content").setAttribute("aria-busy", "true");
    $("search-status").textContent = "Searching…";
  },
  (query) => {
    const route = parseRoute(location.hash);
    liveNavigate(
      route.page === "packages"
        ? catalogLink(
            query,
            route.category,
            route.sort,
            1,
            route.publisher,
            route.maxSize,
          )
        : catalogLink(query),
    );
  },
);
$("search-submit").prepend(icon("search"));
$("browse").prepend(icon("package"));
$("help").prepend(icon("guide"));
labelAction($("publish"), "Publish", "upload");
labelAction($("settings"), "Settings", "settings");
labelAction($("moderate"), "Manage registry", "shield");
for (const id of ["signin", "signout", "search-clear"])
  labelAction($(id), $(id).textContent!.trim());
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
window.addEventListener("hashchange", () => {
  if (location.hash === activeRouteHash) return;
  searchBox.cancel();
  void run(renderRoute);
});
function theme() {
  let choice = "";
  try {
    choice = localStorage.getItem("nemesis-theme") || "";
  } catch {}
  if (choice) document.documentElement.dataset.theme = choice;
  else delete document.documentElement.dataset.theme;
  const dark = choice
    ? choice === "dark"
    : window.matchMedia("(prefers-color-scheme: dark)").matches;
  labelAction($("theme"), dark ? "Use light theme" : "Use dark theme");
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
window.addEventListener("nemesis-theme-changed", theme);
theme();
void run(async () => {
  const code = new URLSearchParams(location.hash.slice(1)).get("auth_code");
  if (code) {
    history.replaceState(null, "", location.pathname + "#publish");
    const verifier = sessionStorage.getItem("nemesis_verifier");
    sessionStorage.removeItem("nemesis_verifier");
    const result = await api("/auth/exchange", { code, verifier });
    setToken(result.token, result.expires_in);
  }
  if (hasSession()) {
    try {
      user = await api("/v1/publisher/me");
      $("signin").hidden = true;
      $("signout").hidden = false;
      $("moderate").hidden = !user.admin;
    } catch {
      notify(
        hasSession()
          ? "Your sign-in could not be verified. Refresh the page to try again."
          : "Your session has expired. Sign in again to publish or manage packages.",
        true,
      );
    }
  }
  await renderRoute();
});
