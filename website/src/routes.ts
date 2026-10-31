export type Route =
  | {
      page: "packages";
      query: string;
      category: string;
      sort: string;
      number: number;
      publisher: string;
      maxSize: string;
    }
  | { page: "package"; id: string; version: string }
  | { page: "publish" | "moderate" | "help" | "settings" }
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
        publisher: "",
        maxSize: "",
      };
    }
  }
  if (
    path === "publish" ||
    path === "moderate" ||
    path === "help" ||
    path === "settings"
  )
    return { page: path };
  const number = Number(query.get("page") || 1);
  return {
    page: "packages",
    query: query.get("q") || "",
    category: query.get("category") || "",
    sort: ["recent", "size"].includes(query.get("sort") || "")
      ? query.get("sort")!
      : "name",
    publisher: query.get("publisher") || "",
    maxSize: /^[1-9][0-9]*$/.test(query.get("max_size") || "")
      ? query.get("max_size")!
      : "",
    number: Number.isSafeInteger(number) && number > 0 ? number : 1,
  };
}
export function catalogLink(
  query = "",
  category = "",
  sort = "name",
  page = 1,
  publisher = "",
  maxSize = "",
) {
  const params = new URLSearchParams({
    q: query,
    category,
    sort,
    page: String(page),
  });
  if (publisher) params.set("publisher", publisher);
  if (maxSize) params.set("max_size", maxSize);
  return "#packages?" + params;
}
export function packageLink(id: string, version = "") {
  return (
    "#packages/" +
    encodeURIComponent(id) +
    (version ? "?version=" + encodeURIComponent(version) : "")
  );
}
