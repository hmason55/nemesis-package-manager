import { Env, now, requireValue } from "./types";
import { random, hash, challenge, seal, body, session } from "./security";
import { github } from "./github";
export async function auth(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url),
    path = url.pathname;
  if (path === "/auth/start" && request.method === "GET") {
    const browser = url.searchParams.get("challenge");
    requireValue(
      browser && /^[A-Za-z0-9_-]{43}$/.test(browser),
      "Supply an S256 browser challenge",
    );
    requireValue(
      env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET,
      "GitHub authentication is not configured",
      503,
    );
    const state = random(),
      verifier = random(),
      cookie = random();
    await env.DB.prepare("INSERT INTO auth_transactions VALUES(?,?,?,?,?)")
      .bind(
        state,
        browser,
        await seal(env, verifier),
        await hash(cookie),
        now() + 600,
      )
      .run();
    const target = new URL("https://github.com/login/oauth/authorize");
    target.search = new URLSearchParams({
      client_id: env.GITHUB_CLIENT_ID,
      redirect_uri: url.origin + "/auth/callback",
      state,
      code_challenge: await challenge(verifier),
      code_challenge_method: "S256",
    }).toString();
    return new Response(null, {
      status: 302,
      headers: {
        Location: target.href,
        "Set-Cookie":
          "nemesis_auth=" +
          cookie +
          "; Path=/auth; HttpOnly; Secure; SameSite=Lax; Max-Age=600",
      },
    });
  }
  if (path === "/auth/callback" && request.method === "GET") {
    const state = url.searchParams.get("state"),
      code = url.searchParams.get("code");
    const cookie = request.headers
      .get("Cookie")
      ?.match(/(?:^|;\s*)nemesis_auth=([a-f0-9]{64})/)?.[1];
    requireValue(state && code && cookie, "Invalid authentication callback");
    const row = await env.DB.prepare(
      "DELETE FROM auth_transactions WHERE state=? AND cookie_hash=? AND expires_at>? RETURNING *",
    )
      .bind(state, await hash(cookie), now())
      .first<any>();
    requireValue(row, "Authentication request expired or already used");
    const { unseal } = await import("./security");
    const response = await fetch(
      "https://github.com/login/oauth/access_token",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          client_id: env.GITHUB_CLIENT_ID,
          client_secret: env.GITHUB_CLIENT_SECRET,
          code,
          redirect_uri: url.origin + "/auth/callback",
          code_verifier: await unseal(env, row.github_verifier),
        }),
      },
    );
    const credentials: any = await response.json();
    requireValue(
      response.ok && credentials.access_token,
      "GitHub sign-in failed",
      401,
    );
    const user = await github("/user", credentials.access_token);
    await env.DB.prepare(
      "INSERT INTO publishers VALUES(?,?) ON CONFLICT(id) DO UPDATE SET login=excluded.login",
    )
      .bind(user.id, user.login)
      .run();
    const exchange = random();
    await env.DB.prepare("INSERT INTO auth_codes VALUES(?,?,?,?,?)")
      .bind(
        await hash(exchange),
        row.browser_challenge,
        user.id,
        await seal(env, credentials.access_token),
        now() + 60,
      )
      .run();
    const target = new URL(env.SITE_URL);
    target.hash = "auth_code=" + exchange;
    return new Response(null, {
      status: 302,
      headers: {
        Location: target.href,
        "Set-Cookie":
          "nemesis_auth=; Path=/auth; HttpOnly; Secure; SameSite=Lax; Max-Age=0",
      },
    });
  }
  if (path === "/auth/exchange" && request.method === "POST") {
    const input = await body(request);
    requireValue(
      typeof input.code === "string" &&
        typeof input.verifier === "string" &&
        /^[a-f0-9]{64}$/.test(input.verifier),
      "Invalid exchange",
    );
    const row = await env.DB.prepare(
      "DELETE FROM auth_codes WHERE code_hash=? AND browser_challenge=? AND expires_at>? RETURNING *",
    )
      .bind(await hash(input.code), await challenge(input.verifier), now())
      .first<any>();
    requireValue(row, "Sign-in exchange expired or already used", 401);
    const token = random();
    await env.DB.prepare("INSERT INTO sessions VALUES(?,?,?,?)")
      .bind(await hash(token), row.publisher_id, row.github_token, now() + 3600)
      .run();
    return Response.json({ token, expires_in: 3600 });
  }
  if (path === "/auth/logout" && request.method === "POST") {
    await session(request, env);
    await env.DB.prepare("DELETE FROM sessions WHERE token_hash=?")
      .bind(await hash(request.headers.get("Authorization")!.slice(7)))
      .run();
    return Response.json({ ok: true });
  }
  return new Response("Not found", { status: 404 });
}
