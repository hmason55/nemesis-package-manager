import { Env, Submission, requireValue } from "./types";
const component = (value: string) =>
  encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase(),
  );
export function publicVersion(row: Submission, origin: string) {
  return {
    ...JSON.parse(row.metadata),
    package_id: row.package_id,
    version: row.version,
    sha256: row.sha256,
    size: row.size,
    release_id: row.release_id,
    asset_id: row.asset_id,
    download_url:
      origin +
      "/v1/packages/" +
      component(row.package_id) +
      "/versions/" +
      component(row.version) +
      "/download",
  };
}
export async function catalog(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url),
    parts = url.pathname.split("/").slice(3).map(decodeURIComponent);
  if (!parts.length || !parts[0]) {
    const page = Math.max(1, Number(url.searchParams.get("page") || 1)),
      query = (url.searchParams.get("q") || "").slice(0, 160).toLowerCase(),
      category = url.searchParams.get("category");
    const sort = url.searchParams.get("sort") || "name";
    requireValue(["name", "recent"].includes(sort), "Invalid sort order");
    requireValue(Number.isSafeInteger(page) && page <= 10000, "Invalid page");
    const rows = await env.DB.prepare(
      "SELECT p.*,r.full_name,u.login,(SELECT version FROM submissions WHERE package_id=p.id AND status='approved' ORDER BY updated_at DESC,id DESC LIMIT 1) AS latest_published_version,(SELECT MAX(updated_at) FROM submissions WHERE package_id=p.id AND status='approved') AS published_at,(SELECT COUNT(*) FROM submissions WHERE package_id=p.id AND status='approved') AS version_count FROM packages p JOIN repositories r ON r.id=p.repository_id LEFT JOIN publishers u ON u.id=r.owner_id WHERE EXISTS(SELECT 1 FROM submissions s WHERE s.package_id=p.id AND s.status='approved') ORDER BY p.id",
    ).all<any>();
    const packages = rows.results.map((row) => ({
      id: row.id,
      ...JSON.parse(row.metadata),
      repository: row.full_name,
      publisher: row.login || row.full_name.split("/")[0],
      latest_published_version: row.latest_published_version,
      published_at: row.published_at,
      version_count: row.version_count,
    }));
    const categories = [
      ...new Set<string>(packages.flatMap((row) => row.categories)),
    ].sort((a, b) => a.localeCompare(b));
    const filtered = packages.filter(
      (row) =>
        (row.id + " " + row.name + " " + row.description)
          .toLowerCase()
          .includes(query) &&
        (!category || row.categories.includes(category)),
    );
    if (sort === "recent")
      filtered.sort(
        (a, b) => b.published_at - a.published_at || a.id.localeCompare(b.id),
      );
    return Response.json({
      schema_version: 1,
      packages: filtered.slice((page - 1) * 50, page * 50),
      page,
      next_page: filtered.length > page * 50 ? page + 1 : null,
      total: filtered.length,
      categories,
      sort,
    });
  }
  const [id, versions, version, download] = parts;
  const pkg = await env.DB.prepare(
    "SELECT p.*,r.full_name FROM packages p JOIN repositories r ON r.id=p.repository_id WHERE p.id=?",
  )
    .bind(id)
    .first<any>();
  requireValue(pkg, "Package not found", 404);
  if (versions === "versions" && version) {
    const row = await env.DB.prepare(
      "SELECT * FROM submissions WHERE package_id=? AND version=? AND status='approved'",
    )
      .bind(id, version)
      .first<Submission>();
    requireValue(row, "Approved version not found", 404);
    if (download === "download" && parts.length === 4) {
      const object = await env.PACKAGES.get(row.object_key);
      requireValue(object, "Package object unavailable", 503);
      return new Response(object.body, {
        headers: {
          "Content-Type": "application/zip",
          "Content-Length": String(row.size),
          "Content-Disposition":
            'attachment; filename="' +
            row.package_id +
            "-" +
            row.version.replace(/[^A-Za-z0-9._-]/g, "_") +
            '.zip"',
          "X-Checksum-SHA256": row.sha256,
          "Cache-Control": "no-store",
        },
      });
    }
    requireValue(parts.length === 3, "Not found", 404);
    return Response.json(publicVersion(row, url.origin));
  }
  requireValue(parts.length === 1, "Not found", 404);
  const rows = await env.DB.prepare(
    "SELECT * FROM submissions WHERE package_id=? AND status='approved' ORDER BY created_at DESC,id",
  )
    .bind(id)
    .all<Submission>();
  requireValue(rows.results.length, "Package not found", 404);
  return Response.json({
    id: pkg.id,
    ...JSON.parse(pkg.metadata),
    repository: pkg.full_name,
    versions: rows.results.map((row) => publicVersion(row, url.origin)),
  });
}
