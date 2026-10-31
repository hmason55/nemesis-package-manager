import { Env, Session, packageId, requireValue } from "./types";
import { body } from "./security";
import { removePackage } from "./management";

// Repository registration alone is not ownership: only a personal, successfully
// published submission grants publisher removal access to its owning package.
const personallyPublished =
  "EXISTS(SELECT 1 FROM submissions own WHERE own.package_id=p.id COLLATE NOCASE AND own.repository_id=p.repository_id AND own.publisher_id=? AND own.status IN ('approved','withdrawn'))";

export async function publisherPackages(
  request: Request,
  env: Env,
  user: Session,
  authorizeRepository: (id: number) => Promise<unknown>,
): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  if (path === "/v1/publisher/packages" && request.method === "GET") {
    const rows = await env.DB.prepare(
      "SELECT p.id,p.repository_id,p.metadata,r.full_name AS repository,(SELECT COUNT(*) FROM submissions s WHERE s.package_id=p.id COLLATE NOCASE AND s.repository_id=p.repository_id AND s.status='approved') AS published_versions FROM packages p JOIN repositories r ON r.id=p.repository_id WHERE " +
        personallyPublished +
        " AND EXISTS(SELECT 1 FROM submissions live WHERE live.package_id=p.id COLLATE NOCASE AND live.repository_id=p.repository_id AND live.status='approved') ORDER BY p.id",
    )
      .bind(user.publisher_id)
      .all();
    return Response.json(rows.results);
  }
  const remove = path.match(/^\/v1\/publisher\/packages\/([^/]+)\/remove$/);
  if (!remove) return null;
  requireValue(request.method === "POST", "Method not allowed", 405);
  const id = packageId(decodeURIComponent(remove[1]));
  const owned = await env.DB.prepare(
    "SELECT p.id,p.repository_id FROM packages p WHERE p.id=? AND " +
      personallyPublished,
  )
    .bind(id, user.publisher_id)
    .first<{ id: string; repository_id: number }>();
  requireValue(owned, "You can only remove packages you have published", 403);
  // Recheck live GitHub permissions, installation and owner identity, rather than
  // trusting a saved repository registration or a client-supplied publisher ID.
  await authorizeRepository(owned.repository_id);
  const input = await body(request);
  const reason = String(input.reason || "")
    .trim()
    .slice(0, 2000);
  await removePackage(env, user, owned.id, reason, owned.repository_id);
  return Response.json({ ok: true });
}
