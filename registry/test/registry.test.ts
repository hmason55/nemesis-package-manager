import { env, applyD1Migrations } from "cloudflare:test";
import {
  beforeAll,
  beforeEach,
  afterEach,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import worker from "../src/index";
import { hash, seal, challenge } from "../src/security";
import { Env, now, metadata as parseMetadata } from "../src/types";
import { publishPending, publishValidated } from "../src/publication";
import { createSubmission } from "../src/publishing";
import { HttpError } from "../src/types";
import { publicVersion } from "../src/catalog";
import { synchronize } from "../src/webhooks";
import { github, checkRepository } from "../src/github";
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
    "blocked_publishers",
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
describe("publisher package removal", () => {
  const otherToken = "12".repeat(32);
  beforeEach(async () => {
    bindings.ADMIN_IDS = "99";
    vi.mocked(checkRepository).mockResolvedValue({
      repo: { id: 10, owner: { id: 1 }, private: false },
      installation: { id: 20 },
    });
    await bindings.DB.prepare("UPDATE submissions SET status='approved'").run();
    await bindings.DB.prepare(
      "INSERT INTO publishers VALUES(2,'collaborator')",
    ).run();
    await bindings.DB.prepare(
      "INSERT INTO repository_publishers VALUES(10,2)",
    ).run();
    await bindings.DB.prepare("INSERT INTO sessions VALUES(?,2,?,?)")
      .bind(
        await hash(otherToken),
        await seal(bindings, "collaborator-token"),
        now() + 3600,
      )
      .run();
  });
  afterEach(() => {
    vi.mocked(checkRepository)
      .mockReset()
      .mockRejectedValue(new Error("Unauthorized repository"));
  });
  async function addVersion(
    id: string,
    version: string,
    status: string,
    publisher = 1,
    repo = 10,
  ) {
    await bindings.DB.prepare(
      "INSERT INTO submissions(id,package_id,repository_id,publisher_id,release_id,asset_id,version,metadata,status,sha256,size,object_key,created_at,updated_at) SELECT ?,package_id,?,?,31,?, ?,metadata,?,sha256,size,object_key,2,2 FROM submissions WHERE id=?",
    )
      .bind(
        id,
        repo,
        publisher,
        Number.parseInt(id.slice(0, 4), 16),
        version,
        status,
        submission,
      )
      .run();
  }
  it("lists only personally published packages, once per ID, excluding unpublished work", async () => {
    await addVersion("31".repeat(32), "2.0", "approved");
    const response = await call(
      "/v1/publisher/packages",
      "GET",
      undefined,
      token,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toMatchObject([
      { id: "example.app", repository: "owner/repo", published_versions: 2 },
    ]);
    await addVersion("32".repeat(32), "3.0", "queued", 2);
    expect(
      await (
        await call("/v1/publisher/packages", "GET", undefined, otherToken)
      ).json(),
    ).toEqual([]);
  });
  it("withdraws owned versions and stops pending work without erasing artifacts, ownership, or another repository's jobs", async () => {
    for (const [id, version, status] of [
      ["31", "2", "approved"],
      ["32", "3", "queued"],
      ["33", "4", "validating"],
      ["34", "5", "review"],
    ])
      await addVersion(id.repeat(32), version, status);
    const stale = await bindings.DB.prepare(
      "SELECT * FROM submissions WHERE id=?",
    )
      .bind("34".repeat(32))
      .first<any>();
    await bindings.DB.prepare(
      "INSERT INTO repositories VALUES(11,'other/repo',21,2,1,1)",
    ).run();
    await addVersion("35".repeat(32), "6", "queued", 2, 11);
    expect(
      (
        await call(
          "/v1/publisher/packages/EXAMPLE.APP/remove",
          "POST",
          { reason: "  Retired package  " },
          token,
        )
      ).status,
    ).toBe(200);
    const rows = await bindings.DB.prepare(
      "SELECT status,report FROM submissions WHERE repository_id=10 ORDER BY version",
    ).all<any>();
    expect(rows.results.map((row) => row.status)).toEqual([
      "withdrawn",
      "withdrawn",
      "rejected",
      "rejected",
      "rejected",
    ]);
    expect(
      rows.results.every(
        (row) => row.report === "Package removed: Retired package",
      ),
    ).toBe(true);
    expect(
      (
        await bindings.DB.prepare(
          "SELECT status FROM submissions WHERE repository_id=11",
        ).first<any>()
      ).status,
    ).toBe("queued");
    expect(
      (await call("/v1/packages/example.app/versions/1.2/download")).status,
    ).toBe(404);
    expect((await (await call("/v1/packages")).json<any>()).total).toBe(0);
    expect(
      await (
        await call("/v1/publisher/packages", "GET", undefined, token)
      ).json(),
    ).toEqual([]);
    expect(
      await bindings.DB.prepare(
        "SELECT * FROM packages WHERE id='example.app'",
      ).first(),
    ).not.toBeNull();
    expect(
      await bindings.PACKAGES.head("sha256/" + sha + ".zip"),
    ).not.toBeNull();
    expect(
      await bindings.DB.prepare(
        "SELECT actor,action,subject FROM audit",
      ).first(),
    ).toMatchObject({
      actor: "1",
      action: "package_removed",
      subject: "example.app",
    });
    await expect(publishValidated(bindings, stale)).rejects.toMatchObject({
      status: 409,
    });
    expect(
      (
        await call(
          "/v1/publisher/packages/example.app/remove",
          "POST",
          { reason: "Repeat" },
          token,
        )
      ).status,
    ).toBe(404);
  });
  it("rejects other publishers, even registered collaborators with pending submissions or spoofed ownership", async () => {
    await addVersion("32".repeat(32), "3.0", "queued", 2);
    expect(
      (
        await call(
          "/v1/publisher/packages/example.app/remove",
          "POST",
          { reason: "Other package", publisher_id: 1, repository_id: 10 },
          otherToken,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await bindings.DB.prepare("SELECT status FROM submissions WHERE id=?")
          .bind(submission)
          .first<any>()
      ).status,
    ).toBe("approved");
    expect(await bindings.DB.prepare("SELECT * FROM audit").first()).toBeNull();
  });
  it("rechecks GitHub access, repository suspension and transfers before removal", async () => {
    vi.mocked(checkRepository).mockRejectedValueOnce(
      new HttpError(403, "Permission revoked"),
    );
    expect(
      (
        await call(
          "/v1/publisher/packages/example.app/remove",
          "POST",
          { reason: "Retire" },
          token,
        )
      ).status,
    ).toBe(403);
    vi.mocked(checkRepository).mockResolvedValueOnce({
      repo: { id: 10, owner: { id: 2 } },
      installation: { id: 20 },
    });
    expect(
      (
        await call(
          "/v1/publisher/packages/example.app/remove",
          "POST",
          { reason: "Retire" },
          token,
        )
      ).status,
    ).toBe(403);
    await bindings.DB.prepare(
      "UPDATE repositories SET active=0 WHERE id=10",
    ).run();
    expect(
      (
        await call(
          "/v1/publisher/packages/example.app/remove",
          "POST",
          { reason: "Retire" },
          token,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await bindings.DB.prepare("SELECT status FROM submissions WHERE id=?")
          .bind(submission)
          .first<any>()
      ).status,
    ).toBe("approved");
  });
  it("requires a session, POST and a nonblank reason; maintainers can still remove anyone's package", async () => {
    expect((await call("/v1/publisher/packages")).status).toBe(401);
    expect(
      (
        await call("/v1/publisher/packages/example.app/remove", "POST", {
          reason: "Retire",
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await call(
          "/v1/publisher/packages/example.app/remove",
          "GET",
          undefined,
          token,
        )
      ).status,
    ).toBe(405);
    expect(
      (
        await call(
          "/v1/publisher/packages/example.app/remove",
          "POST",
          { reason: "  " },
          token,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await call(
          "/v1/admin/packages/example.app/remove",
          "POST",
          { reason: "Not a maintainer" },
          otherToken,
        )
      ).status,
    ).toBe(403);
    bindings.ADMIN_IDS = "2";
    vi.mocked(checkRepository).mockRejectedValue(
      new HttpError(403, "No publisher access"),
    );
    expect(
      (
        await call(
          "/v1/admin/packages/example.app/remove",
          "POST",
          { reason: "Maintainer withdrawal" },
          otherToken,
        )
      ).status,
    ).toBe(200);
    expect(
      (await call("/v1/packages/example.app/versions/1.2/download")).status,
    ).toBe(404);
  });
});

describe("public catalog and moderation", () => {
  it("enforces blocked release authors and webhook actors through automatic publication", async () => {
    const repo = await bindings.DB.prepare(
      "SELECT * FROM repositories WHERE id=10",
    ).first<any>();
    const input = {
      package_id: "actor.app",
      version: "1",
      metadata,
      release_id: 31,
      asset_id: 41,
    };
    const release = {
      id: 31,
      author: { id: 2 },
      draft: false,
      assets: [{ id: 41, name: "test.zip", size: 3, state: "uploaded" }],
    };
    await bindings.DB.prepare(
      "INSERT INTO blocked_publishers VALUES(2,'Blocked release author',1,1)",
    ).run();
    vi.mocked(github).mockResolvedValueOnce(release);
    await expect(
      createSubmission(bindings, repo, 1, input),
    ).rejects.toMatchObject({ status: 403 });
    await bindings.DB.prepare(
      "INSERT INTO blocked_publishers VALUES(3,'Blocked event actor',1,1)",
    ).run();
    vi.mocked(github).mockResolvedValueOnce({ ...release, author: { id: 4 } });
    await expect(
      createSubmission(bindings, repo, null, input, 3),
    ).rejects.toMatchObject({ status: 403 });
    await bindings.DB.prepare(
      "DELETE FROM blocked_publishers WHERE publisher_id=3",
    ).run();
    vi.mocked(github).mockResolvedValueOnce({ ...release, author: { id: 4 } });
    const created = await createSubmission(bindings, repo, null, input, 3);
    await bindings.DB.prepare(
      "UPDATE submissions SET status='review',sha256=?,size=3,object_key=? WHERE id=?",
    )
      .bind(sha, "sha256/" + sha + ".zip", created.id)
      .run();
    const row = await bindings.DB.prepare(
      "SELECT * FROM submissions WHERE id=?",
    )
      .bind(created.id)
      .first<any>();
    expect(row.source_actor_id).toBe(3);
    expect(row.release_author_id).toBe(4);
    vi.mocked(github).mockImplementationOnce(async () => {
      await bindings.DB.prepare(
        "INSERT INTO blocked_publishers VALUES(3,'Concurrent event-actor block',1,1)",
      ).run();
      return { id: 10, owner: { id: 1 }, private: false };
    });
    await expect(publishValidated(bindings, row)).rejects.toMatchObject({
      status: 409,
    });
    expect(
      await bindings.DB.prepare(
        "SELECT * FROM packages WHERE id='actor.app'",
      ).first(),
    ).toBe(null);
    await call(
      "/v1/admin/publishers/4/block",
      "POST",
      { reason: "Block release creator" },
      token,
    );
    expect(
      (
        await bindings.DB.prepare("SELECT status FROM submissions WHERE id=?")
          .bind(created.id)
          .first<any>()
      ).status,
    ).toBe("rejected");
  });
  it("blocks accounts and repository owners without introducing a publication gate", async () => {
    await bindings.DB.prepare(
      "INSERT INTO publishers VALUES(2,'blocked-user')",
    ).run();
    await bindings.DB.prepare(
      "INSERT INTO repositories VALUES(11,'blocked-user/repo',21,2,1,1)",
    ).run();
    expect(
      (await call("/v1/admin/publishers/2/block", "POST", { reason: "Abuse" }))
        .status,
    ).toBe(401);
    expect(
      (
        await call(
          "/v1/admin/publishers/1/block",
          "POST",
          { reason: "Self" },
          token,
        )
      ).status,
    ).toBe(400);
    const stale = await bindings.DB.prepare(
      "SELECT * FROM submissions WHERE id=?",
    )
      .bind(submission)
      .first<any>();
    await bindings.DB.prepare("UPDATE submissions SET publisher_id=2").run();
    expect(
      (
        await call(
          "/v1/admin/publishers/2/block",
          "POST",
          { reason: "Abusive publishing" },
          token,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await (
          await call("/v1/admin/blocks", "GET", undefined, token)
        ).json<any[]>()
      )[0].login,
    ).toBe("blocked-user");
    await expect(
      publishValidated(bindings, { ...stale, publisher_id: 2 }),
    ).rejects.toMatchObject({ status: 403 });
    const repo = await bindings.DB.prepare(
      "SELECT * FROM repositories WHERE id=11",
    ).first<any>();
    await expect(
      createSubmission(bindings, repo, null, {}),
    ).rejects.toMatchObject({ status: 403 });
    await expect(createSubmission(bindings, repo, 1, {})).rejects.toMatchObject(
      { status: 403 },
    );
    const userToken = "56".repeat(32);
    await bindings.DB.prepare("INSERT INTO sessions VALUES(?,2,?,?)")
      .bind(
        await hash(userToken),
        await seal(bindings, "github-token"),
        now() + 3600,
      )
      .run();
    expect(
      (await call("/v1/publisher/me", "GET", undefined, userToken)).status,
    ).toBe(403);
    expect(
      (
        await call(
          "/v1/admin/publishers/2/unblock",
          "POST",
          { reason: "Resolved" },
          token,
        )
      ).status,
    ).toBe(200);
    expect(
      (await call("/v1/publisher/me", "GET", undefined, userToken)).status,
    ).toBe(200);
    expect(
      (
        await bindings.DB.prepare("SELECT status FROM submissions WHERE id=?")
          .bind(submission)
          .first<any>()
      ).status,
    ).toBe("rejected");
    expect(
      (
        await (
          await call("/v1/admin/blocks", "GET", undefined, token)
        ).json<any[]>()
      ).length,
    ).toBe(0);
  });
  it("cannot publish if a publisher is blocked during the external authorization check", async () => {
    await bindings.DB.prepare("UPDATE submissions SET publisher_id=NULL").run();
    const row = await bindings.DB.prepare(
      "SELECT * FROM submissions WHERE id=?",
    )
      .bind(submission)
      .first<any>();
    vi.mocked(github).mockImplementationOnce(async () => {
      await bindings.DB.prepare(
        "INSERT INTO blocked_publishers VALUES(1,'Concurrent block',1,99)",
      ).run();
      return { id: 10, owner: { id: 1 }, private: false };
    });
    await expect(publishValidated(bindings, row)).rejects.toMatchObject({
      status: 409,
    });
    expect(
      (await call("/v1/packages/example.app/versions/1.2/download")).status,
    ).toBe(404);
  });
  it("uploads private package icons and removes every public version without approval", async () => {
    const raw = new Uint8Array(45);
    raw.set([
      137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1,
      0, 0, 0, 1,
    ]);
    const digest = Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", raw)),
      (v) => v.toString(16).padStart(2, "0"),
    ).join("");
    const upload = (checksum = digest, bytes = raw) =>
      worker.fetch(
        new Request(
          "https://registry.test/internal/jobs/" + submission + "/icon",
          {
            method: "PUT",
            headers: {
              Authorization: "Bearer validator-secret",
              "Content-Length": String(bytes.length),
              "X-Checksum-SHA256": checksum,
            },
            body: bytes,
          },
        ),
        bindings,
      );
    expect((await upload()).status).toBe(409);
    await bindings.DB.prepare(
      "UPDATE submissions SET status='validating'",
    ).run();
    expect((await upload("00".repeat(32))).status).toBe(400);
    expect((await upload(digest, new Uint8Array(44))).status).toBe(400);
    const oversized = raw.slice();
    new DataView(oversized.buffer).setUint32(16, 513);
    expect((await upload(digest, oversized)).status).toBe(400);
    expect((await upload()).status).toBe(200);
    expect(
      (await call("/v1/packages/example.app/versions/1.2/icon")).status,
    ).toBe(404);
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
    const list = await (await call("/v1/packages")).json<any>();
    expect(list.packages[0].icon_url).toBe(
      "https://registry.test/v1/packages/example.app/versions/1.2/icon",
    );
    expect(list.packages[0].avatar_url).toBe(
      "https://avatars.githubusercontent.com/u/1?s=80",
    );
    const icon = await call("/v1/packages/example.app/versions/1.2/icon");
    expect(icon.status).toBe(200);
    expect(icon.headers.get("Content-Type")).toBe("image/png");
    expect(icon.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(new Uint8Array(await icon.arrayBuffer())).toEqual(raw);
    await bindings.DB.prepare(
      "INSERT INTO submissions(id,package_id,repository_id,publisher_id,release_id,asset_id,version,metadata,status,sha256,size,object_key,created_at,updated_at) SELECT ?,package_id,repository_id,publisher_id,31,41,'2.0',metadata,'approved',sha256,size,object_key,2,2 FROM submissions WHERE id=?",
    )
      .bind("98".repeat(32), submission)
      .run();
    expect(
      (
        await call(
          "/v1/admin/packages/example.app/remove",
          "POST",
          { reason: "Broken package" },
          token,
        )
      ).status,
    ).toBe(200);
    for (const suffix of ["1.2/icon", "1.2/download", "2.0/download"])
      expect(
        (await call("/v1/packages/example.app/versions/" + suffix)).status,
      ).toBe(404);
    await publishPending(bindings);
    expect((await (await call("/v1/packages")).json<any>()).total).toBe(0);
  });
  it("does not let a stale publication finisher restore older listing metadata", async () => {
    const stale = await bindings.DB.prepare(
      "SELECT * FROM submissions WHERE id=?",
    )
      .bind(submission)
      .first<any>();
    await publishValidated(bindings, stale);
    const second = "91".repeat(32),
      latestMetadata = {
        ...metadata,
        name: "Newer package listing",
        description: "Latest validated description",
      };
    await bindings.DB.prepare(
      "INSERT INTO submissions(id,package_id,repository_id,publisher_id,release_id,asset_id,version,metadata,status,sha256,size,object_key,report,created_at,updated_at) SELECT ?,package_id,repository_id,publisher_id,31,41,'2.0',?,'review',sha256,size,object_key,report,created_at,updated_at FROM submissions WHERE id=?",
    )
      .bind(second, JSON.stringify(latestMetadata), submission)
      .run();
    const current = await bindings.DB.prepare(
      "SELECT * FROM submissions WHERE id=?",
    )
      .bind(second)
      .first<any>();
    await publishValidated(bindings, current);
    await expect(publishValidated(bindings, stale)).rejects.toMatchObject({
      status: 409,
    });
    const listing = await (await call("/v1/packages/example.app")).json<any>();
    expect(listing.name).toBe(latestMetadata.name);
    expect(listing.description).toBe(latestMetadata.description);
    expect(
      (
        await bindings.DB.prepare("SELECT status FROM submissions WHERE id=?")
          .bind(second)
          .first<any>()
      ).status,
    ).toBe("approved");
  });
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
  it("combines publisher and size filters before pagination and keeps discovery facets", async () => {
    await bindings.DB.prepare("UPDATE submissions SET status='approved'").run();
    await bindings.DB.prepare(
      "INSERT INTO publishers VALUES(2,'OtherOwner')",
    ).run();
    await bindings.DB.prepare(
      "INSERT INTO repositories VALUES(11,'OtherOwner/tools',21,2,1,1)",
    ).run();
    for (let i = 0; i < 55; i++) {
      const id = "extra." + String(i).padStart(2, "0"),
        details = JSON.stringify({
          ...metadata,
          name: id,
          categories: ["tools"],
        });
      await bindings.DB.prepare("INSERT INTO packages VALUES(?,11,?)")
        .bind(id, details)
        .run();
      await bindings.DB.prepare(
        "INSERT INTO submissions(id,package_id,repository_id,publisher_id,release_id,asset_id,version,metadata,status,sha256,size,object_key,report,created_at,updated_at) VALUES(?,?,11,2,30,?,'1.0',?,'approved',?,?,?,'validated',1,?)",
      )
        .bind(
          String(i).padStart(64, "0"),
          id,
          i + 100,
          details,
          sha,
          i + 10,
          "sha256/" + sha + ".zip",
          i + 10,
        )
        .run();
    }
    const result = await (
      await call(
        "/v1/packages?publisher=otherOWNER&category=tools&sort=size&page=2&max_size=64",
      )
    ).json<any>();
    expect(result.total).toBe(55);
    expect(result.packages.map((p: any) => p.id)).toEqual([
      "extra.50",
      "extra.51",
      "extra.52",
      "extra.53",
      "extra.54",
    ]);
    expect(result.next_page).toBe(null);
    expect(result.publishers).toEqual(["OtherOwner", "publisher"]);
    expect(result.categories).toEqual(["tools", "utilities"]);
    const small = await (
      await call("/v1/packages?publisher=otherowner&max_size=12&sort=size")
    ).json<any>();
    expect(small.total).toBe(3);
    expect(small.packages.map((p: any) => p.latest_size)).toEqual([10, 11, 12]);
    const search = await (
      await call("/v1/packages?q=otherowner%2Ftools&max_size=10")
    ).json<any>();
    expect(search.packages.map((p: any) => p.id)).toEqual(["extra.00"]);
    await bindings.DB.prepare(
      "UPDATE submissions SET status='withdrawn' WHERE repository_id=11",
    ).run();
    const withdrawn = await (
      await call("/v1/packages?publisher=otherowner")
    ).json<any>();
    expect(withdrawn.total).toBe(0);
    expect(withdrawn.publishers).toEqual(["publisher"]);
  });
  it("bounds download-size filters and uses the latest public version only", async () => {
    await bindings.DB.prepare("UPDATE submissions SET status='approved'").run();
    await bindings.DB.prepare(
      "INSERT INTO submissions(id,package_id,repository_id,publisher_id,release_id,asset_id,version,metadata,status,sha256,size,object_key,report,created_at,updated_at) SELECT ?,package_id,repository_id,publisher_id,31,41,'2.0',metadata,'approved',sha256,100,object_key,report,2,2 FROM submissions WHERE id=?",
    )
      .bind("97".repeat(32), submission)
      .run();
    expect(
      (await (await call("/v1/packages?max_size=3")).json<any>()).total,
    ).toBe(0);
    await bindings.DB.prepare(
      "UPDATE submissions SET status='withdrawn' WHERE version='2.0'",
    ).run();
    expect(
      (await (await call("/v1/packages?max_size=3")).json<any>()).packages[0]
        .latest_size,
    ).toBe(3);
    for (const value of ["0", "-1", "2.5", "NaN", "Infinity", "536870913"]) {
      expect((await call("/v1/packages?max_size=" + value)).status).toBe(400);
    }
    expect(
      (await call("/v1/packages?publisher=" + "a".repeat(101))).status,
    ).toBe(400);
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
        sender: { id: 77 },
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
          "SELECT actor_id FROM release_events",
        ).first<any>()
      ).actor_id,
    ).toBe(77);
    expect(
      (
        await bindings.DB.prepare(
          "SELECT COUNT(*) AS count FROM release_events",
        ).first<any>()
      ).count,
    ).toBe(1);
  });
});
