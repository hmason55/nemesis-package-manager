import {
  Env,
  Submission,
  HttpError,
  MAX_ZIP,
  now,
  requireValue,
} from "./types";
import { github, installationToken } from "./github";
import { audit } from "./security";
import { publishingAllowed } from "./management";

export async function publishValidated(env: Env, row: Submission) {
  requireValue(
    row.package_id.toLowerCase() !== "usb.package.manager",
    "Package Manager uses its dedicated self-update workflow",
    409,
  );
  requireValue(
    row.status === "review" &&
      /^[a-f0-9]{64}$/.test(row.sha256 || "") &&
      row.object_key === "sha256/" + row.sha256 + ".zip" &&
      row.size > 0 &&
      row.size <= MAX_ZIP,
    "Only validated submissions can be approved",
    409,
  );
  const repo = await env.DB.prepare(
    "SELECT * FROM repositories WHERE id=? AND active=1",
  )
    .bind(row.repository_id)
    .first<any>();
  requireValue(
    repo && repo.consent_at > 0,
    "Repository authorization suspended or redistribution consent missing",
    403,
  );
  await publishingAllowed(env, row.publisher_id, repo.owner_id);
  const live = await github(
    "/repos/" + repo.full_name,
    await installationToken(env, repo.installation_id),
  );
  requireValue(
    live.id === repo.id &&
      live.owner.id === repo.owner_id &&
      live.private === false,
    "Repository authorization changed",
    403,
  );
  const object = await env.PACKAGES.head(row.object_key);
  requireValue(
    object && object.size === row.size,
    "Validated artifact is unavailable",
    409,
  );
  const claim = await env.DB.prepare(
    "SELECT id,repository_id FROM packages WHERE id=?",
  )
    .bind(row.package_id)
    .first<any>();
  requireValue(
    !claim || claim.repository_id === row.repository_id,
    "Package ID already reserved",
    409,
  );
  requireValue(
    !claim || claim.id === row.package_id,
    "Use the exact case of the registered package ID",
    409,
  );
  const result = await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO packages SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM submissions s JOIN repositories r ON r.id=s.repository_id WHERE s.id=? AND s.status='review' AND r.active=1 AND r.consent_at>0 AND r.owner_id=? AND r.installation_id=? AND NOT EXISTS(SELECT 1 FROM blocked_publishers WHERE publisher_id IN (s.publisher_id,r.owner_id))) ON CONFLICT(id) DO NOTHING",
    ).bind(
      row.package_id,
      row.repository_id,
      row.metadata,
      row.id,
      repo.owner_id,
      repo.installation_id,
    ),
    env.DB.prepare(
      "UPDATE submissions SET status='approved',updated_at=? WHERE id=? AND status='review' AND EXISTS(SELECT 1 FROM repositories r WHERE r.id=submissions.repository_id AND r.active=1 AND r.consent_at>0 AND r.owner_id=? AND r.installation_id=? AND NOT EXISTS(SELECT 1 FROM blocked_publishers WHERE publisher_id IN (submissions.publisher_id,r.owner_id))) AND EXISTS(SELECT 1 FROM packages WHERE id=? COLLATE BINARY AND repository_id=?) AND NOT EXISTS(SELECT 1 FROM submissions WHERE package_id=? COLLATE NOCASE AND version=? AND status IN ('approved','withdrawn') AND id<>?)",
    ).bind(
      now(),
      row.id,
      repo.owner_id,
      repo.installation_id,
      row.package_id,
      row.repository_id,
      row.package_id,
      row.version,
      row.id,
    ),
    // D1 runs this batch sequentially in one transaction. Only this batch's
    // successful review -> approved transition may replace listing metadata;
    // an older finisher must not restore metadata after a newer publication.
    env.DB.prepare(
      "UPDATE packages SET metadata=? WHERE changes()=1 AND id=? AND repository_id=? AND EXISTS(SELECT 1 FROM submissions WHERE id=? AND status='approved')",
    ).bind(row.metadata, row.package_id, row.repository_id, row.id),
  ]);
  requireValue(
    result[1].meta.changes === 1,
    "Approval conflicted with another submission",
    409,
  );
}

export async function publishPending(env: Env) {
  const pending = await env.DB.prepare(
    "SELECT * FROM submissions WHERE status='review' ORDER BY updated_at,id LIMIT 20",
  ).all<Submission>();
  for (const row of pending.results) {
    try {
      await publishValidated(env, row);
      await audit(env, "validator", "published", row.id);
    } catch (error) {
      await publicationFailure(env, row.id, error);
    }
  }
}
export async function publicationFailure(env: Env, id: string, error: unknown) {
  const terminal = error instanceof HttpError && error.status === 409;
  await env.DB.prepare(
    "UPDATE submissions SET status=?,report=?,updated_at=? WHERE id=? AND status='review'",
  )
    .bind(
      terminal ? "failed" : "review",
      terminal
        ? "Publication conflict: " + error.message
        : "Validated; publication pending: " +
            (error instanceof HttpError ? error.message : "provider recovery"),
      now(),
      id,
    )
    .run();
  await audit(
    env,
    "validator",
    terminal ? "publication_failed" : "publication_pending",
    id,
  );
  return terminal ? "failed" : "publication_pending";
}
