import {
  Env,
  Session,
  Submission,
  now,
  metadata,
  packageId,
  versionText,
  requireValue,
  MAX_ZIP,
} from "./types";
import { session, isAdmin, body, audit, random, service } from "./security";
import { multipart } from "./uploads";
import {
  github,
  checkRepository,
  installationToken,
  dispatchValidation,
} from "./github";
async function repository(env: Env, user: Session, id: number) {
  const stored = await env.DB.prepare(
    "SELECT * FROM repositories WHERE id=? AND active=1",
  )
    .bind(id)
    .first<any>();
  requireValue(stored, "Register or re-authorize this repository first", 403);
  const { repo, installation } = await checkRepository(
    env,
    user.github_token,
    user.login,
    stored.full_name,
  );
  requireValue(
    repo.id === stored.id &&
      repo.owner.id === stored.owner_id &&
      installation.id === stored.installation_id,
    "Repository ownership changed; register it again",
    403,
  );
  return stored;
}
export async function createSubmission(
  env: Env,
  repo: any,
  publisher: number | null,
  input: any,
) {
  const id = packageId(input.package_id),
    version = versionText(input.version),
    details = metadata(input.metadata);
  const owner = await env.DB.prepare(
    "SELECT id,repository_id FROM packages WHERE id=?",
  )
    .bind(id)
    .first<any>();
  requireValue(
    !owner || owner.repository_id === repo.id,
    "Package ID belongs to another repository",
    409,
  );
  requireValue(
    !owner || owner.id === id,
    "Use the exact case of the registered package ID",
    409,
  );
  const approved = await env.DB.prepare(
    "SELECT id FROM submissions WHERE package_id=? COLLATE NOCASE AND version=? AND status IN ('approved','withdrawn')",
  )
    .bind(id, version)
    .first();
  requireValue(!approved, "Published versions cannot be replaced", 409);
  const token = await installationToken(env, repo.installation_id),
    release = await github(
      "/repos/" + repo.full_name + "/releases/" + Number(input.release_id),
      token,
    );
  requireValue(!release.draft, "Draft releases cannot be published");
  const asset = release.assets.find(
    (a: any) => a.id === Number(input.asset_id),
  );
  requireValue(
    asset &&
      /\.zip$/i.test(asset.name) &&
      asset.state === "uploaded" &&
      asset.size > 0 &&
      asset.size <= MAX_ZIP,
    "Select an uploaded installer ZIP of at most 512 MiB",
  );
  const duplicate = await env.DB.prepare(
    "SELECT id FROM submissions WHERE repository_id=? AND asset_id=?",
  )
    .bind(repo.id, asset.id)
    .first<any>();
  if (duplicate) return { id: duplicate.id, existing: true };
  const submission = random();
  await env.DB.prepare(
    "INSERT INTO submissions(id,package_id,repository_id,publisher_id,release_id,asset_id,version,metadata,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,'queued',?,?)",
  )
    .bind(
      submission,
      id,
      repo.id,
      publisher,
      release.id,
      asset.id,
      version,
      JSON.stringify(details),
      now(),
      now(),
    )
    .run();
  await audit(env, publisher || "webhook", "submission_created", submission);
  // A dispatch failure leaves a durable queued job for the scheduled retry.
  try {
    await dispatchValidation(env, submission);
  } catch {
    console.log(
      JSON.stringify({
        event: "validation_dispatch_pending",
        subject: submission,
      }),
    );
  }
  return { id: submission, existing: false };
}
export async function publisher(request: Request, env: Env) {
  const user = await session(request, env),
    url = new URL(request.url),
    path = url.pathname;
  if (path === "/v1/publisher/me" && request.method === "GET")
    return Response.json({
      id: user.publisher_id,
      login: user.login,
      admin: isAdmin(env, user.publisher_id),
      installation_url:
        "https://github.com/apps/" + env.GITHUB_APP_SLUG + "/installations/new",
    });
  if (path === "/v1/publisher/repositories" && request.method === "GET")
    return Response.json(
      (
        await env.DB.prepare(
          "SELECT r.* FROM repositories r JOIN repository_publishers p ON p.repository_id=r.id WHERE p.publisher_id=?",
        )
          .bind(user.publisher_id)
          .all()
      ).results,
    );
  if (path === "/v1/publisher/repositories" && request.method === "POST") {
    const input = await body(request);
    requireValue(
      input.redistribution_consent === true,
      "Consent to redistribute releases through Cloudflare is required",
    );
    const { repo, installation } = await checkRepository(
      env,
      user.github_token,
      user.login,
      input.repository,
    );
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO repositories VALUES(?,?,?,?,1,?) ON CONFLICT(id) DO UPDATE SET full_name=excluded.full_name,installation_id=excluded.installation_id,owner_id=excluded.owner_id,active=1,consent_at=excluded.consent_at",
      ).bind(repo.id, repo.full_name, installation.id, repo.owner.id, now()),
      env.DB.prepare(
        "INSERT OR IGNORE INTO repository_publishers VALUES(?,?)",
      ).bind(repo.id, user.publisher_id),
    ]);
    await audit(
      env,
      user.publisher_id,
      "repository_registered",
      String(repo.id),
    );
    return Response.json({ id: repo.id, repository: repo.full_name });
  }
  const releaseRoute = path.match(
    /^\/v1\/publisher\/repositories\/(\d+)\/releases$/,
  );
  if (releaseRoute && request.method === "GET") {
    const repo = await repository(env, user, Number(releaseRoute[1]));
    return Response.json(
      await github(
        "/repos/" + repo.full_name + "/releases?per_page=100",
        user.github_token,
      ),
    );
  }
  if (path === "/v1/publisher/submissions" && request.method === "GET")
    return Response.json(
      (
        await env.DB.prepare(
          "SELECT s.* FROM submissions s JOIN repository_publishers p ON p.repository_id=s.repository_id WHERE p.publisher_id=? ORDER BY created_at DESC LIMIT 200",
        )
          .bind(user.publisher_id)
          .all()
      ).results,
    );
  if (path === "/v1/publisher/events" && request.method === "GET")
    return Response.json(
      (
        await env.DB.prepare(
          "SELECT e.*,r.full_name FROM release_events e JOIN repositories r ON r.id=e.repository_id JOIN repository_publishers p ON p.repository_id=r.id WHERE p.publisher_id=? ORDER BY release_id DESC LIMIT 100",
        )
          .bind(user.publisher_id)
          .all()
      ).results,
    );
  if (
    (path === "/v1/publisher/submissions" || path === "/v1/publisher/sync") &&
    request.method === "POST"
  ) {
    const input = await body(request),
      repo = await repository(env, user, Number(input.repository_id));
    return Response.json(
      await createSubmission(env, repo, user.publisher_id, input),
      { status: 202 },
    );
  }
  return new Response("Not found", { status: 404 });
}
export async function admin(request: Request, env: Env) {
  const user = await session(request, env);
  requireValue(
    isAdmin(env, user.publisher_id),
    "Administrator access required",
    403,
  );
  const path = new URL(request.url).pathname;
  if (path === "/v1/admin/submissions" && request.method === "GET")
    return Response.json(
      (
        await env.DB.prepare(
          "SELECT s.*,r.full_name AS repository,p.login AS publisher FROM submissions s JOIN repositories r ON r.id=s.repository_id LEFT JOIN publishers p ON p.id=s.publisher_id ORDER BY s.created_at DESC LIMIT 200",
        ).all()
      ).results,
    );
  const route = path.match(
    /^\/v1\/admin\/submissions\/([a-f0-9]{64})\/(approve|reject|withdraw|retry)$/,
  );
  requireValue(route && request.method === "POST", "Not found", 404);
  const row = await env.DB.prepare("SELECT * FROM submissions WHERE id=?")
    .bind(route[1])
    .first<Submission>();
  requireValue(row, "Submission not found", 404);
  const action = route[2],
    input = await body(request),
    report = String(input.reason || "").slice(0, 2000);
  if (action === "approve") {
    requireValue(
      row.status === "review" && row.object_key && row.sha256,
      "Only validated submissions can be approved",
      409,
    );
    const repo = await env.DB.prepare(
      "SELECT * FROM repositories WHERE id=? AND active=1",
    )
      .bind(row.repository_id)
      .first<any>();
    requireValue(repo, "Repository authorization suspended", 403);
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
      "SELECT repository_id FROM packages WHERE id=?",
    )
      .bind(row.package_id)
      .first<any>();
    requireValue(
      !claim || claim.repository_id === row.repository_id,
      "Package ID already reserved",
      409,
    );
    const result = await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO packages VALUES(?,?,?) ON CONFLICT(id) DO NOTHING",
      ).bind(row.package_id, row.repository_id, row.metadata),
      env.DB.prepare(
        "UPDATE submissions SET status='approved',updated_at=? WHERE id=? AND status='review' AND EXISTS(SELECT 1 FROM packages WHERE id=? AND repository_id=?) AND NOT EXISTS(SELECT 1 FROM submissions WHERE package_id=? COLLATE NOCASE AND version=? AND status IN ('approved','withdrawn') AND id<>?)",
      ).bind(
        now(),
        row.id,
        row.package_id,
        row.repository_id,
        row.package_id,
        row.version,
        row.id,
      ),
      env.DB.prepare(
        "UPDATE packages SET metadata=? WHERE id=? AND repository_id=? AND EXISTS(SELECT 1 FROM submissions WHERE id=? AND status='approved')",
      ).bind(row.metadata, row.package_id, row.repository_id, row.id),
    ]);
    requireValue(
      result[1].meta.changes === 1,
      "Approval conflicted with another submission",
      409,
    );
  } else {
    const allowed =
      action === "withdraw"
        ? ["approved"]
        : action === "retry"
          ? ["failed"]
          : ["queued", "validating", "review", "failed"];
    requireValue(
      allowed.includes(row.status),
      "Invalid moderation transition",
      409,
    );
    await env.DB.prepare(
      "UPDATE submissions SET status=?,report=?,updated_at=? WHERE id=? AND status=?",
    )
      .bind(
        action === "withdraw"
          ? "withdrawn"
          : action === "retry"
            ? "queued"
            : "rejected",
        report,
        now(),
        row.id,
        row.status,
      )
      .run();
    if (action === "retry") await dispatchValidation(env, row.id);
  }
  await audit(env, user.publisher_id, action, row.id);
  return Response.json({ ok: true });
}
export async function validator(request: Request, env: Env) {
  await service(request, env);
  const url = new URL(request.url),
    route = url.pathname.match(
      /^\/internal\/jobs\/([a-f0-9]{64})(?:\/(claim|artifact|complete|fail|multipart\/(?:start|part\/\d+|complete|abort)))?$/,
    );
  requireValue(route, "Not found", 404);
  const row = await env.DB.prepare(
    "SELECT s.*,r.full_name,r.installation_id,r.active FROM submissions s JOIN repositories r ON r.id=s.repository_id WHERE s.id=?",
  )
    .bind(route[1])
    .first<any>();
  requireValue(row, "Job not found", 404);
  if (request.method === "POST" && route[2] === "claim") {
    requireValue(row.active, "Repository suspended", 409);
    const changed = await env.DB.prepare(
      "UPDATE submissions SET status='validating',updated_at=? WHERE id=? AND status='queued'",
    )
      .bind(now(), row.id)
      .run();
    requireValue(changed.meta.changes === 1, "Job already claimed", 409);
    return Response.json({
      id: row.id,
      package_id: row.package_id,
      version: row.version,
      repository: row.full_name,
      release_id: row.release_id,
      asset_id: row.asset_id,
    });
  }
  requireValue(row.status === "validating", "Job is not validating", 409);
  if (route[2]?.startsWith("multipart/"))
    return multipart(request, env, row, route[2].slice(10));
  if (request.method === "PUT" && route[2] === "artifact") {
    const digest = request.headers.get("X-Checksum-SHA256") || "",
      size = Number(request.headers.get("Content-Length"));
    requireValue(
      /^[a-f0-9]{64}$/.test(digest) &&
        size > 0 &&
        size <= 64 * 1024 * 1024 &&
        request.body,
      "Invalid artifact",
    );
    const key = "sha256/" + digest + ".zip";
    const existing = await env.PACKAGES.head(key);
    if (!existing)
      await env.PACKAGES.put(key, request.body, {
        sha256: digest,
        httpMetadata: { contentType: "application/zip" },
      });
    else
      requireValue(
        existing.size === size,
        "Existing artifact size mismatch",
        409,
      );
    await env.DB.prepare(
      "UPDATE submissions SET sha256=?,size=?,object_key=?,updated_at=? WHERE id=? AND status='validating'",
    )
      .bind(digest, size, key, now(), row.id)
      .run();
    return Response.json({ ok: true });
  }
  if (request.method === "POST" && route[2] === "complete") {
    requireValue(
      row.object_key && row.sha256,
      "Upload validated artifact first",
      409,
    );
    const input = await body(request);
    requireValue(
      input.package_id === row.package_id && input.version === row.version,
      "Manifest identity mismatch",
    );
    await env.DB.prepare(
      "UPDATE submissions SET status='review',report=?,updated_at=? WHERE id=? AND status='validating'",
    )
      .bind(
        "Archive and manifest validated; sha256=" + row.sha256,
        now(),
        row.id,
      )
      .run();
    await audit(env, "validator", "validation_passed", row.id);
    return Response.json({ ok: true });
  }
  if (request.method === "POST" && route[2] === "fail") {
    const input = await body(request);
    await env.DB.prepare(
      "UPDATE submissions SET status='failed',report=?,updated_at=? WHERE id=? AND status='validating'",
    )
      .bind(
        String(input.reason || "Validation failed").slice(0, 2000),
        now(),
        row.id,
      )
      .run();
    await audit(env, "validator", "validation_failed", row.id);
    return Response.json({ ok: true });
  }
  return new Response("Not found", { status: 404 });
}
