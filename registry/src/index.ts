import { Env, HttpError, now, requireValue } from "./types";
import { hash } from "./security";
import { auth } from "./auth";
import { catalog } from "./catalog";
import { publisher, admin, validator } from "./publishing";
import { webhook, synchronize } from "./webhooks";
import { dispatchValidation } from "./github";
import { cleanupUploads } from "./uploads";
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get("Origin"),
      allowed = new URL(env.SITE_URL).origin,
      path = new URL(request.url).pathname;
    let response: Response;
    try {
      requireValue(!origin || origin === allowed, "Origin not allowed", 403);
      if (request.method === "OPTIONS")
        response = new Response(null, { status: 204 });
      else if (path.startsWith("/auth/")) response = await auth(request, env);
      else if (path.startsWith("/v1/publisher/"))
        response = await publisher(request, env);
      else if (path.startsWith("/v1/admin/"))
        response = await admin(request, env);
      else if (path.startsWith("/internal/jobs/"))
        response = await validator(request, env);
      else if (path === "/webhooks/github")
        response = await webhook(request, env);
      else if (path === "/v1/packages" || path.startsWith("/v1/packages/")) {
        requireValue(request.method === "GET", "Method not allowed", 405);
        response = await catalog(request, env);
      } else response = Response.json({ error: "Not found" }, { status: 404 });
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500;
      if (status === 500)
        console.error(
          JSON.stringify({
            event: "api_error",
            path: path.replace(/[a-f0-9]{64}/g, ":id"),
          }),
        );
      response = Response.json(
        {
          error:
            error instanceof HttpError
              ? error.message
              : "Registry request failed",
        },
        { status },
      );
    }
    response = new Response(response.body, response);
    const publicJson =
      path.startsWith("/v1/packages") &&
      response.status === 200 &&
      response.headers.get("Content-Type")?.includes("json");
    response.headers.set(
      "Cache-Control",
      publicJson ? "public, max-age=60" : "no-store",
    );
    if (publicJson) {
      const etag = '"' + (await hash(await response.clone().text())) + '"';
      response.headers.set("ETag", etag);
      if (request.headers.get("If-None-Match") === etag)
        response = new Response(null, {
          status: 304,
          headers: response.headers,
        });
    }
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("Referrer-Policy", "no-referrer");
    if (origin === allowed) {
      response.headers.set("Access-Control-Allow-Origin", allowed);
      response.headers.set("Vary", "Origin");
      response.headers.set(
        "Access-Control-Allow-Headers",
        "Authorization, Content-Type",
      );
      response.headers.set(
        "Access-Control-Allow-Methods",
        "GET, POST, OPTIONS",
      );
    }
    return response;
  },
  async scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext) {
    await cleanupUploads(env);
    await env.DB.batch(
      ["sessions", "auth_transactions", "auth_codes"].map((table) =>
        env.DB.prepare("DELETE FROM " + table + " WHERE expires_at<?").bind(
          now(),
        ),
      ),
    );
    await synchronize(env);
    const pending = await env.DB.prepare(
      "SELECT id FROM submissions WHERE status='queued' ORDER BY created_at LIMIT 10",
    ).all<{ id: string }>();
    for (const job of pending.results)
      try {
        await dispatchValidation(env, job.id);
      } catch {
        console.log(
          JSON.stringify({
            event: "validation_dispatch_pending",
            subject: job.id,
          }),
        );
      }
    await env.DB.prepare(
      "UPDATE submissions SET status='failed',report='Validation timed out; administrator may retry',updated_at=? WHERE status='validating' AND updated_at<?",
    )
      .bind(now(), now() - 3600)
      .run();
  },
};
