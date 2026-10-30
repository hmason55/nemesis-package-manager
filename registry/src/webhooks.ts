import { Env, HttpError, now, requireValue } from "./types";
import { hex, audit, limitedText } from "./security";
import { github, installationToken } from "./github";
import { createSubmission } from "./publishing";
export async function webhook(request: Request, env: Env) {
  requireValue(request.method === "POST", "Method not allowed", 405);
  const raw = await limitedText(request, 1024 * 1024);
  const signature = request.headers.get("X-Hub-Signature-256") || "";
  requireValue(
    /^sha256=[a-f0-9]{64}$/.test(signature) && env.GITHUB_WEBHOOK_SECRET,
    "Invalid webhook signature",
    401,
  );
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.GITHUB_WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const expected =
    "sha256=" +
    hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw)));
  let difference = 0;
  for (let i = 0; i < expected.length; i++)
    difference |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  requireValue(difference === 0, "Invalid webhook signature", 401);
  const delivery = request.headers.get("X-GitHub-Delivery");
  requireValue(delivery && delivery.length <= 100, "Missing delivery ID");
  if (
    await env.DB.prepare("SELECT id FROM webhook_deliveries WHERE id=?")
      .bind(delivery)
      .first()
  )
    return Response.json({ accepted: true, duplicate: true }, { status: 202 });
  const event = request.headers.get("X-GitHub-Event"),
    input = JSON.parse(raw);
  // Delivery insertion and durable event changes are one transaction. Processing is retried by cron.
  const changes = [
    env.DB.prepare("INSERT OR IGNORE INTO webhook_deliveries VALUES(?,?)").bind(
      delivery,
      now(),
    ),
  ];
  if (event === "installation" && ["deleted", "suspend"].includes(input.action))
    changes.push(
      env.DB.prepare(
        "UPDATE repositories SET active=0 WHERE installation_id=?",
      ).bind(input.installation.id),
    );
  if (event === "installation_repositories" && input.action === "removed")
    for (const repo of input.repositories_removed || [])
      changes.push(
        env.DB.prepare("UPDATE repositories SET active=0 WHERE id=?").bind(
          repo.id,
        ),
      );
  if (
    event === "repository" &&
    ["transferred", "privatized", "deleted", "archived"].includes(input.action)
  )
    changes.push(
      env.DB.prepare("UPDATE repositories SET active=0 WHERE id=?").bind(
        input.repository.id,
      ),
    );
  if (
    event === "release" &&
    ["published", "released", "edited"].includes(input.action) &&
    input.repository &&
    input.release
  )
    changes.push(
      env.DB.prepare(
        "INSERT OR IGNORE INTO release_events(repository_id,release_id) VALUES(?,?)",
      ).bind(input.repository.id, input.release.id),
    );
  await env.DB.batch(changes);
  return Response.json({ accepted: true }, { status: 202 });
}
export async function synchronize(env: Env) {
  const events = await env.DB.prepare(
    "SELECT e.*,r.full_name,r.installation_id,r.metadata FROM release_events e JOIN (SELECT r.*,p.metadata FROM repositories r JOIN packages p ON p.repository_id=r.id GROUP BY r.id) r ON r.id=e.repository_id WHERE e.status='pending' AND r.active=1 LIMIT 10",
  ).all<any>();
  for (const event of events.results) {
    try {
      const release = await github(
        "/repos/" + event.full_name + "/releases/" + event.release_id,
        await installationToken(env, event.installation_id),
      );
      const assets = release.assets.filter((a: any) => /\.zip$/i.test(a.name));
      const packages = await env.DB.prepare(
        "SELECT * FROM packages WHERE repository_id=?",
      )
        .bind(event.repository_id)
        .all<any>();
      if (assets.length !== 1 || packages.results.length !== 1) {
        await env.DB.prepare(
          "UPDATE release_events SET status='selection_required',message='Select the package, version, and installer asset in the publisher portal' WHERE repository_id=? AND release_id=?",
        )
          .bind(event.repository_id, event.release_id)
          .run();
        continue;
      }
      // Only a tag that is an exact package version candidate is proposed; validator checks the manifest.
      const pkg = packages.results[0];
      const details = JSON.parse(pkg.metadata);
      details.release_notes = String(release.body || "").slice(0, 20000);
      const existing = await env.DB.prepare(
        "SELECT id FROM submissions WHERE repository_id=? AND asset_id=?",
      )
        .bind(event.repository_id, assets[0].id)
        .first();
      if (!existing)
        await createSubmission(
          env,
          {
            id: event.repository_id,
            full_name: event.full_name,
            installation_id: event.installation_id,
          },
          null,
          {
            package_id: pkg.id,
            version: release.tag_name.replace(/^v(?=\d)/, ""),
            metadata: details,
            release_id: release.id,
            asset_id: assets[0].id,
          },
        );
      await env.DB.prepare(
        "UPDATE release_events SET status='submitted' WHERE repository_id=? AND release_id=?",
      )
        .bind(event.repository_id, event.release_id)
        .run();
    } catch (error) {
      if (
        error instanceof HttpError &&
        [400, 403, 409, 422].includes(error.status)
      ) {
        await env.DB.prepare(
          "UPDATE release_events SET status='selection_required',message=? WHERE repository_id=? AND release_id=?",
        )
          .bind(
            error.message.slice(0, 500),
            event.repository_id,
            event.release_id,
          )
          .run();
        await audit(
          env,
          "webhook",
          "release_sync_selection_required",
          String(event.release_id),
        );
        continue;
      }
      await audit(
        env,
        "webhook",
        "release_sync_pending",
        String(event.release_id),
      );
    }
  }
}
