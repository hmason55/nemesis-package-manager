import { env, applyD1Migrations } from "cloudflare:test";
import { beforeAll, beforeEach, describe, it, expect, vi } from "vitest";
import worker from "../src/index";
import { hash, seal, challenge } from "../src/security";
import { Env, now, metadata as parseMetadata } from "../src/types";
import { publishPending } from "../src/publication";
import { createSubmission } from "../src/publishing";
import { HttpError } from "../src/types";
import { publicVersion } from "../src/catalog";
import { synchronize } from "../src/webhooks";
import { github } from "../src/github";
import urlFixtures from "../../contracts/fixtures/url-components.json";
vi.mock("../src/github", () => ({
  github: vi.fn(async (path: string) =>
    path === "/user"
      ? { id: 1, login: "publisher" }
      : { id: 10, owner: { id: 1 }, private: false },
  ),
  installationToken: vi.fn(async () => "installation-token"),
  dispatchValidation: vi.fn(async () => {}),
  checkRepository: vi.fn(async () => {
    throw new Error("Unauthorized repository");
  }),
}));
const bindings = env as unknown as Env & { TEST_MIGRATIONS: any };
const token = "ab".repeat(32),
  submission = "cd".repeat(32),
  sha = "ef".repeat(32);
const metadata = {
  name: "Example",
  description: "A community package",
  categories: ["utilities"],
  compatibility: { vehicles: [], firmware: [], nemesis: "" },
  release_notes: "Test release",
};
async function call(
  path: string,
  method = "GET",
  body?: unknown,
  auth?: string,
  headers: Record<string, string> = {},
) {
  return worker.fetch(
    new Request("https://registry.test" + path, {
      method,
      headers: {
        ...(auth ? { Authorization: "Bearer " + auth } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    bindings,
  );
}
beforeAll(async () => {
  await applyD1Migrations(bindings.DB, bindings.TEST_MIGRATIONS);
});
beforeEach(async () => {
  bindings.ADMIN_IDS = "1";
  for (const table of [
    "artifact_parts",
    "artifact_uploads",
    "audit",
    "release_events",
    "webhook_deliveries",
    "auth_transactions",
    "auth_codes",
    "sessions",
    "submissions",
    "packages",
    "repository_publishers",
    "repositories",
    "publishers",
  ])
    await bindings.DB.prepare("DELETE FROM " + table).run();
  await bindings.DB.prepare(
    "INSERT INTO publishers VALUES(1,'publisher')",
  ).run();
  await bindings.DB.prepare(
    "INSERT INTO repositories VALUES(10,'owner/repo',20,1,1,1)",
  ).run();
  await bindings.DB.prepare(
    "INSERT INTO repository_publishers VALUES(10,1)",
  ).run();
  await bindings.DB.prepare("INSERT INTO sessions VALUES(?,1,?,?)")
    .bind(await hash(token), await seal(bindings, "github-token"), now() + 3600)
    .run();
  await bindings.DB.prepare("INSERT INTO packages VALUES('example.app',10,?)")
    .bind(JSON.stringify(metadata))
    .run();
  await bindings.DB.prepare(
    "INSERT INTO submissions(id,package_id,repository_id,publisher_id,release_id,asset_id,version,metadata,status,sha256,size,object_key,report,created_at,updated_at) VALUES(?,'example.app',10,1,30,40,'1.2',?,'review',?,3,?,'validated',1,1)",
  )
    .bind(submission, JSON.stringify(metadata), sha, "sha256/" + sha + ".zip")
    .run();
  await bindings.PACKAGES.put("sha256/" + sha + ".zip", "zip");
});
describe("public catalog and moderation", () => {
  it("publishes legacy validated submissions after fresh authorization without moderator action", async () => {
    await publishPending(bindings);
    expect(
      (await call("/v1/packages/example.app/versions/1.2/download")).status,
    ).toBe(200);
    await call(
      "/v1/admin/submissions/" + submission + "/withdraw",
      "POST",
      {},
      token,
    );
    await publishPending(bindings);
    expect(
      (await call("/v1/packages/example.app/versions/1.2/download")).status,
    ).toBe(404);
  });
  it("retains verified bytes pending suspended, private, transferred, or temporarily unavailable repository authorization", async () => {
    await bindings.DB.prepare("UPDATE repositories SET active=0").run();
    await publishPending(bindings);
    expect(
      (await call("/v1/packages/example.app/versions/1.2/download")).status,
    ).toBe(404);
    await bindings.DB.prepare(
      "UPDATE repositories SET active=1,consent_at=0",
    ).run();
    await publishPending(bindings);
    await bindings.DB.prepare("UPDATE repositories SET consent_at=1").run();
    for (const response of [
      { id: 10, owner: { id: 1 }, private: true },
      { id: 10, owner: { id: 99 }, private: false },
    ]) {
      vi.mocked(github).mockResolvedValueOnce(response);
      await publishPending(bindings);
      expect(
        (
          await bindings.DB.prepare("SELECT status FROM submissions WHERE id=?")
            .bind(submission)
            .first<any>()
        ).status,
      ).toBe("review");
    }
    vi.mocked(github).mockRejectedValueOnce(
      new HttpError(502, "Provider unavailable"),
    );
    await publishPending(bindings);
    const pending = await bindings.DB.prepare(
      "SELECT status,report FROM submissions WHERE id=?",
    )
      .bind(submission)
      .first<any>();
    expect(pending.status).toBe("review");
    expect(pending.report).toContain("publication pending");
    await publishPending(bindings);
    expect(
      (await call("/v1/packages/example.app/versions/1.2/download")).status,
    ).toBe(200);
  });
  it("never republishes rejected or failed jobs and reserves the manager identity", async () => {
    for (const state of ["rejected", "failed"]) {
      await bindings.DB.prepare("UPDATE submissions SET status=?")
        .bind(state)
        .run();
      await publishPending(bindings);
      expect(
        (
          await bindings.DB.prepare("SELECT status FROM submissions WHERE id=?")
            .bind(submission)
            .first<any>()
        ).status,
      ).toBe(state);
    }
    await bindings.DB.prepare(
      "UPDATE submissions SET status='review',package_id='USB.Package.Manager'",
    ).run();
    await publishPending(bindings);
    expect(
      (
        await bindings.DB.prepare("SELECT status FROM submissions WHERE id=?")
          .bind(submission)
          .first<any>()
      ).status,
    ).toBe("failed");
    await expect(
      createSubmission(bindings, { id: 10 }, 1, {
        package_id: "usb.package.manager",
        version: "1",
        metadata,
      }),
    ).rejects.toThrow("dedicated self-update");
  });
  it("caps pending work atomically per repository and per publisher", async () => {
    await bindings.DB.prepare(
      "INSERT INTO repositories VALUES(11,'owner/second',21,1,1,1)",
    ).run();
    for (const repository of [10, 11]) {
      await bindings.DB.prepare("DELETE FROM submissions WHERE id<>?")
        .bind(submission)
        .run();
      await bindings.DB.prepare("UPDATE submissions SET status='failed'").run();
      for (let i = 0; i < 20; i++)
        await bindings.DB.prepare(
          "INSERT INTO submissions(id,package_id,repository_id,publisher_id,release_id,asset_id,version,metadata,status,created_at,updated_at) VALUES(?,?,?,1,30,?,?,'{}','queued',1,1)",
        )
          .bind(
            i.toString(16).padStart(64, "0"),
            "pending.app",
            repository,
            100 + i,
            String(i),
          )
          .run();
      vi.mocked(github).mockResolvedValueOnce({
        id: 50,
        draft: false,
        assets: [{ id: 500, name: "test.zip", size: 3, state: "uploaded" }],
      });
      await expect(
        createSubmission(
          bindings,
          { id: 10, installation_id: 20, full_name: "owner/repo" },
          1,
          {
            package_id: "new.app",
            version: "1",
            metadata,
            release_id: 50,
            asset_id: 500,
          },
        ),
      ).rejects.toMatchObject({ status: 429 });
      expect(
        (
          await bindings.DB.prepare(
            "SELECT COUNT(*) AS n FROM submissions WHERE status='queued'",
          ).first<any>()
        ).n,
      ).toBe(20);
    }
  });
  it("allows omitted advisory declarations and retains informational ranges", () => {
    const { compatibility: ignored, ...input } = metadata;
    expect(parseMetadata(input).compatibility).toEqual({
      vehicles: [],
      firmware: [],
      nemesis: "",
    });
    expect(
      parseMetadata({ ...input, compatibility: { nemesis: ">=1" } })
        .compatibility.nemesis,
    ).toBe(">=1");
    expect(() =>
      parseMetadata({ ...input, compatibility: { vehicles: 42 } }),
    ).toThrow("Invalid metadata list");
  });
  it("uses canonical URL components shared by the Python and vehicle clients", () => {
    for (const fixture of urlFixtures) {
      const value = publicVersion(
        {
          package_id: "example.app",
          version: fixture.value,
          metadata: JSON.stringify(metadata),
        } as any,
        "https://registry.test",
      );
      expect(value.download_url).toBe(
        "https://registry.test/v1/packages/example.app/versions/" +
          fixture.encoded +
          "/download",
      );
    }
  });
  it("does not approve concurrent initial claims with different ID casing", async () => {
    bindings.ADMIN_IDS = "1";
    await bindings.DB.prepare("DELETE FROM packages").run();
    await bindings.DB.prepare(
      "INSERT INTO submissions(id,package_id,repository_id,publisher_id,release_id,asset_id,version,metadata,status,sha256,size,object_key,report,created_at,updated_at) SELECT ?,'Example.App',repository_id,publisher_id,release_id,41,'2.0',metadata,status,sha256,size,object_key,report,created_at,updated_at FROM submissions WHERE id=?",
    )
      .bind("12".repeat(32), submission)
      .run();
    const responses = await Promise.all(
      [submission, "12".repeat(32)].map((id) =>
        call("/v1/admin/submissions/" + id + "/approve", "POST", {}, token),
      ),
    );
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    const pkg = await bindings.DB.prepare(
      "SELECT id FROM packages",
    ).first<any>();
    const approved = await bindings.DB.prepare(
      "SELECT package_id FROM submissions WHERE status='approved'",
    ).all<any>();
    expect(approved.results).toHaveLength(1);
    expect(approved.results[0].package_id).toBe(pkg.id);
  });
  it("retires published and terminal release events while preserving transient retries", async () => {
    await bindings.DB.prepare("UPDATE submissions SET status='approved'").run();
    for (const id of [30, 31, 32])
      await bindings.DB.prepare(
        "INSERT INTO release_events(repository_id,release_id) VALUES(10,?)",
      )
        .bind(id)
        .run();
    vi.mocked(github).mockImplementation(async (path: string) => {
      if (path.endsWith("/32")) throw new Error("Temporary GitHub outage");
      const id = Number(path.split("/").pop());
      return {
        id,
        tag_name: "v1.2",
        body: "",
        assets: [{ id: id === 30 ? 40 : 41, name: "example.zip" }],
      };
    });
    try {
      await synchronize(bindings);
      const rows = await bindings.DB.prepare(
        "SELECT release_id,status FROM release_events ORDER BY release_id",
      ).all<any>();
      expect(rows.results.map((r) => r.status)).toEqual([
        "submitted",
        "selection_required",
        "pending",
      ]);
    } finally {
      vi.mocked(github).mockImplementation(async (path: string) =>
        path === "/user"
          ? { id: 1, login: "publisher" }
          : { id: 10, owner: { id: 1 }, private: false },
      );
    }
  });
  it("provides category facets and counts independently of the active filter", async () => {
    await bindings.DB.prepare("UPDATE submissions SET status='approved'").run();
    const result: any = await (await call("/v1/packages?sort=recent")).json();
    expect(result.total).toBe(1);
    expect(result.categories).toEqual(["utilities"]);
    expect(result.packages[0].latest_published_version).toBe("1.2");
    expect(result.packages[0].version_count).toBe(1);
    const empty: any = await (
      await call("/v1/packages?category=missing")
    ).json();
    expect(empty.total).toBe(0);
    expect(empty.categories).toEqual(["utilities"]);
    expect((await call("/v1/packages?sort=unknown")).status).toBe(400);
  });
  it("rejects a second approved artifact for the same immutable version", async () => {
    await bindings.DB.prepare(
      "INSERT INTO submissions(id,package_id,repository_id,publisher_id,release_id,asset_id,version,metadata,status,sha256,size,object_key,report,created_at,updated_at) SELECT ?,package_id,repository_id,publisher_id,release_id,41,version,metadata,'approved',sha256,size,object_key,report,created_at,updated_at FROM submissions WHERE id=?",
    )
      .bind("13".repeat(32), submission)
      .run();
    expect(
      (
        await call(
          "/v1/admin/submissions/" + submission + "/approve",
          "POST",
          {},
          token,
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await bindings.DB.prepare("SELECT status FROM submissions WHERE id=?")
          .bind(submission)
          .first<any>()
      ).status,
    ).toBe("review");
  });
  it("does not list or download a pending version", async () => {
    expect(
      ((await (await call("/v1/packages")).json()) as any).packages,
    ).toEqual([]);
    expect(
      (await call("/v1/packages/example.app/versions/1.2/download")).status,
    ).toBe(404);
  });
  it("requires authentication and administrator role", async () => {
    expect((await call("/v1/admin/submissions")).status).toBe(401);
    expect(
      (await call("/v1/admin/submissions", "GET", undefined, token)).status,
    ).toBe(200);
    const previous = bindings.ADMIN_IDS;
    bindings.ADMIN_IDS = "2";
    expect(
      (await call("/v1/admin/submissions", "GET", undefined, token)).status,
    ).toBe(403);
    bindings.ADMIN_IDS = previous;
  });
  it("approves then withdraws exact immutable bytes", async () => {
    expect(
      (
        await call(
          "/v1/admin/submissions/" + submission + "/approve",
          "POST",
          {},
          token,
        )
      ).status,
    ).toBe(200);
    const list: any = await (
      await call("/v1/packages?q=example&category=utilities")
    ).json();
    expect(list.packages).toHaveLength(1);
    const download = await call(
      "/v1/packages/example.app/versions/1.2/download",
    );
    expect(download.headers.get("Content-Disposition")).toContain(
      "example.app-1.2.zip",
    );
    expect(new TextDecoder().decode(await download.arrayBuffer())).toBe("zip");
    expect(download.headers.get("Cache-Control")).toBe("no-store");
    expect(
      (
        await call(
          "/v1/admin/submissions/" + submission + "/withdraw",
          "POST",
          { reason: "Unsafe" },
          token,
        )
      ).status,
    ).toBe(200);
    expect(
      (await call("/v1/packages/example.app/versions/1.2/download")).status,
    ).toBe(404);
    expect(
      ((await (await call("/v1/packages")).json()) as any).packages,
    ).toHaveLength(0);
  });
  it("cannot approve unvalidated or rejected submissions", async () => {
    await bindings.DB.prepare("UPDATE submissions SET status='failed'").run();
    expect(
      (
        await call(
          "/v1/admin/submissions/" + submission + "/approve",
          "POST",
          {},
          token,
        )
      ).status,
    ).toBe(409);
  });
  it("cannot approve a conflicting ownership claim", async () => {
    await bindings.DB.prepare(
      "INSERT INTO repositories VALUES(11,'other/repo',21,2,1,1)",
    ).run();
    await bindings.DB.prepare("UPDATE packages SET repository_id=11").run();
    expect(
      (
        await call(
          "/v1/admin/submissions/" + submission + "/approve",
          "POST",
          {},
          token,
        )
      ).status,
    ).toBe(409);
  });
  it("provides ETags only for approved metadata", async () => {
    await bindings.DB.prepare("UPDATE submissions SET status='approved'").run();
    const first = await call("/v1/packages");
    expect(first.headers.get("ETag")).toBeTruthy();
    expect(
      (
        await call("/v1/packages", "GET", undefined, undefined, {
          "If-None-Match": first.headers.get("ETag")!,
        })
      ).status,
    ).toBe(304);
  });
  it("rejects an untrusted browser origin", async () => {
    expect(
      (
        await call("/v1/packages", "GET", undefined, undefined, {
          Origin: "https://evil.test",
        })
      ).status,
    ).toBe(403);
  });
});
describe("authentication and ingestion", () => {
  it("completes state/PKCE login only with the initiating browser cookie", async () => {
    bindings.GITHUB_CLIENT_ID = "test-client";
    bindings.GITHUB_CLIENT_SECRET = "test-secret";
    const verifier = "45".repeat(32),
      start = await call(
        "/auth/start?challenge=" + (await challenge(verifier)),
      );
    expect(start.status).toBe(302);
    const state = new URL(start.headers.get("Location")!).searchParams.get(
      "state",
    );
    const cookie = start.headers.get("Set-Cookie")!.split(";")[0];
    expect(start.headers.get("Set-Cookie")).toContain("HttpOnly");
    const callback = "/auth/callback?state=" + state + "&code=github-code";
    expect(
      (
        await call(callback, "GET", undefined, undefined, {
          Cookie: "nemesis_auth=" + "00".repeat(32),
        })
      ).status,
    ).toBe(400);
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json({ access_token: "github-token" }));
    try {
      const good = await call(callback, "GET", undefined, undefined, {
        Cookie: cookie,
      });
      expect(good.status).toBe(302);
      const code = new URLSearchParams(
        new URL(good.headers.get("Location")!).hash.slice(1),
      ).get("auth_code");
      expect(
        (await call("/auth/exchange", "POST", { code, verifier })).status,
      ).toBe(200);
      expect(
        (await call(callback, "GET", undefined, undefined, { Cookie: cookie }))
          .status,
      ).toBe(400);
    } finally {
      fetch.mockRestore();
    }
  });
  it("automatically publishes exact validated bytes without an administrator", async () => {
    bindings.ADMIN_IDS = "2";
    await bindings.DB.prepare(
      "UPDATE submissions SET status='queued',object_key=NULL,sha256=NULL",
    ).run();
    expect(
      (
        await call(
          "/internal/jobs/" + submission + "/claim",
          "POST",
          {},
          "validator-secret",
        )
      ).status,
    ).toBe(200);
    const checksum = await hash("zip");
    const uploaded = await worker.fetch(
      new Request(
        "https://registry.test/internal/jobs/" + submission + "/artifact",
        {
          method: "PUT",
          headers: {
            Authorization: "Bearer validator-secret",
            "Content-Length": "3",
            "X-Checksum-SHA256": checksum,
          },
          body: "zip",
        },
      ),
      bindings,
    );
    expect(uploaded.status).toBe(200);
    expect(
      (
        await call(
          "/internal/jobs/" + submission + "/complete",
          "POST",
          { package_id: "other.app", version: "1.2" },
          "validator-secret",
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await call(
          "/internal/jobs/" + submission + "/complete",
          "POST",
          { package_id: "example.app", version: "1.2" },
          "validator-secret",
        )
      ).status,
    ).toBe(200);
    expect(
      (await call("/v1/packages/example.app/versions/1.2/download")).status,
    ).toBe(200);
    expect(
      (
        await call(
          "/internal/jobs/" + submission + "/complete",
          "POST",
          { package_id: "example.app", version: "1.2" },
          "validator-secret",
        )
      ).status,
    ).toBe(409);
  });
  it("binds single-use exchanges to the initiating verifier", async () => {
    const code = "12".repeat(32),
      verifier = "34".repeat(32);
    await bindings.DB.prepare("INSERT INTO auth_codes VALUES(?,?,1,?,?)")
      .bind(
        await hash(code),
        await challenge(verifier),
        await seal(bindings, "github-token"),
        now() + 60,
      )
      .run();
    expect(
      (
        await call("/auth/exchange", "POST", {
          code,
          verifier: "00".repeat(32),
        })
      ).status,
    ).toBe(401);
    const good = await call("/auth/exchange", "POST", { code, verifier });
    expect(good.status).toBe(200);
    expect(((await good.json()) as any).token).toMatch(/^[a-f0-9]{64}$/);
    expect(
      (await call("/auth/exchange", "POST", { code, verifier })).status,
    ).toBe(401);
  });
  it("expires sessions and exchanges", async () => {
    await bindings.DB.prepare("UPDATE sessions SET expires_at=0").run();
    expect(
      (await call("/v1/publisher/me", "GET", undefined, token)).status,
    ).toBe(401);
  });
  it("rejects submission without repository authorization", async () => {
    const result = await call(
      "/v1/publisher/submissions",
      "POST",
      { repository_id: 99 },
      token,
    );
    expect(result.status).toBe(403);
  });
  it("does not let validators publish or complete jobs without an artifact", async () => {
    await bindings.DB.prepare(
      "UPDATE submissions SET status='queued',object_key=NULL,sha256=NULL",
    ).run();
    expect(
      (await call("/internal/jobs/" + submission + "/claim", "POST", {}))
        .status,
    ).toBe(401);
    expect(
      (
        await call(
          "/internal/jobs/" + submission + "/claim",
          "POST",
          {},
          "validator-secret",
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await call(
          "/internal/jobs/" + submission + "/claim",
          "POST",
          {},
          "validator-secret",
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await call(
          "/internal/jobs/" + submission + "/complete",
          "POST",
          { package_id: "example.app", version: "1.2" },
          "validator-secret",
        )
      ).status,
    ).toBe(409);
    expect(
      (await call("/v1/packages/example.app/versions/1.2/download")).status,
    ).toBe(404);
  });
  it("rejects unsigned webhook requests", async () => {
    expect(
      (await call("/webhooks/github", "POST", { action: "published" })).status,
    ).toBe(401);
  });
  it("deduplicates signed release deliveries", async () => {
    const input = {
        action: "published",
        repository: { id: 10 },
        release: { id: 31 },
      },
      raw = JSON.stringify(input);
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(bindings.GITHUB_WEBHOOK_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const signature = Array.from(
      new Uint8Array(
        await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw)),
      ),
      (x) => x.toString(16).padStart(2, "0"),
    ).join("");
    const headers = {
      "X-Hub-Signature-256": "sha256=" + signature,
      "X-GitHub-Delivery": "delivery-1",
      "X-GitHub-Event": "release",
    };
    expect(
      (await call("/webhooks/github", "POST", input, undefined, headers))
        .status,
    ).toBe(202);
    expect(
      (await call("/webhooks/github", "POST", input, undefined, headers))
        .status,
    ).toBe(202);
    expect(
      (
        await bindings.DB.prepare(
          "SELECT COUNT(*) AS count FROM release_events",
        ).first<any>()
      ).count,
    ).toBe(1);
  });
});
