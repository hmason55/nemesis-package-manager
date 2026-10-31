import { Env, Session, now, requireValue, packageId } from "./types";
import { audit, body, isAdmin } from "./security";

export async function publishingAllowed(
  env: Env,
  ...ids: (number | null | undefined)[]
) {
  for (const id of new Set(ids.filter((id) => id != null))) {
    const blocked = await env.DB.prepare(
      "SELECT publisher_id FROM blocked_publishers WHERE publisher_id=?",
    )
      .bind(id)
      .first();
    requireValue(
      !blocked,
      "This GitHub account is blocked from publishing",
      403,
    );
  }
}

export async function removePackage(
  env: Env,
  user: Session,
  id: string,
  reason: string,
  repositoryId?: number,
) {
  requireValue(reason, "Supply a reason for this action");
  const changed = await env.DB.prepare(
    "UPDATE submissions SET status=CASE WHEN status='approved' THEN 'withdrawn' ELSE 'rejected' END,report=?,updated_at=? WHERE package_id=? AND status IN ('approved','queued','validating','review')" +
      (repositoryId === undefined ? "" : " AND repository_id=?"),
  )
    .bind(
      "Package removed: " + reason,
      now(),
      id,
      ...(repositoryId === undefined ? [] : [repositoryId]),
    )
    .run();
  requireValue(
    changed.meta.changes > 0,
    "No public or pending package found",
    404,
  );
  await audit(env, user.publisher_id, "package_removed", id);
}

export async function manage(
  request: Request,
  env: Env,
  user: Session,
): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  if (path === "/v1/admin/blocks" && request.method === "GET") {
    const rows = await env.DB.prepare(
      "SELECT b.*,COALESCE(p.login,'GitHub user '||b.publisher_id) AS login FROM blocked_publishers b LEFT JOIN publishers p ON p.id=b.publisher_id ORDER BY b.created_at DESC",
    ).all();
    return Response.json(rows.results);
  }
  const block = path.match(/^\/v1\/admin\/publishers\/(\d+)\/(block|unblock)$/);
  const remove = path.match(/^\/v1\/admin\/packages\/([^/]+)\/remove$/);
  if (!block && !remove) return null;
  requireValue(request.method === "POST", "Method not allowed", 405);
  const input = await body(request),
    reason = String(input.reason || "")
      .trim()
      .slice(0, 2000);
  requireValue(reason, "Supply a reason for this action");
  if (block) {
    const id = Number(block[1]);
    requireValue(
      Number.isSafeInteger(id) && id > 0 && !isAdmin(env, id),
      "Choose a non-administrator GitHub account",
    );
    if (block[2] === "block") {
      await env.DB.batch([
        env.DB.prepare(
          "INSERT INTO blocked_publishers VALUES(?,?,?,?) ON CONFLICT(publisher_id) DO UPDATE SET reason=excluded.reason,created_at=excluded.created_at,actor_id=excluded.actor_id",
        ).bind(id, reason, now(), user.publisher_id),
        env.DB.prepare(
          "UPDATE submissions SET status='rejected',report=?,updated_at=? WHERE status IN ('queued','validating','review') AND (publisher_id=? OR source_actor_id=? OR release_author_id=? OR repository_id IN (SELECT id FROM repositories WHERE owner_id=?))",
        ).bind(
          "Publishing stopped: account blocked. " + reason,
          now(),
          id,
          id,
          id,
          id,
        ),
      ]);
    } else
      await env.DB.prepare(
        "DELETE FROM blocked_publishers WHERE publisher_id=?",
      )
        .bind(id)
        .run();
    await audit(env, user.publisher_id, block[2], String(id));
  } else {
    const id = packageId(decodeURIComponent(remove![1]));
    await removePackage(env, user, id, reason);
  }
  return Response.json({ ok: true });
}
