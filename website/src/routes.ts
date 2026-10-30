export type Route =
  | {
      page: "packages";
      query: string;
      category: string;
      sort: string;
      number: number;
    }
  | { page: "package"; id: string; version: string }
  | { page: "publish" | "moderate" | "help" }
  | { page: "guides"; id: string; section: number };
export function parseRoute(hash: string): Route {
  const [path, search = ""] = hash.replace(/^#/, "").split("?"),
    query = new URLSearchParams(search);
  if (path === "guides" || path === "help" || path.startsWith("guides/"))
    return {
      page: "guides",
      id: path.startsWith("guides/") ? path.slice(7) : "",
      section: Number(query.get("section") || 0),
    };
  if (path.startsWith("packages/")) {
    try {
      return {
        page: "package",
        id: decodeURIComponent(path.slice(9)),
        version: query.get("version") || "",
      };
    } catch {
      return {
        page: "packages",
        query: "",
        category: "",
        sort: "name",
        number: 1,
      };
    }
  }
  if (path === "publish" || path === "moderate" || path === "help")
    return { page: path };
  const number = Number(query.get("page") || 1);
  return {
    page: "packages",
    query: query.get("q") || "",
    category: query.get("category") || "",
    sort: query.get("sort") === "recent" ? "recent" : "name",
    number: Number.isSafeInteger(number) && number > 0 ? number : 1,
  };
}
export function catalogLink(
  query = "",
  category = "",
  sort = "name",
  page = 1,
) {
  return (
    "#packages?" +
    new URLSearchParams({ q: query, category, sort, page: String(page) })
  );
}
export function packageLink(id: string, version = "") {
  return (
    "#packages/" +
    encodeURIComponent(id) +
    (version ? "?version=" + encodeURIComponent(version) : "")
  );
}
