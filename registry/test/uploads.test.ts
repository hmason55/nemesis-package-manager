import { env, applyD1Migrations } from "cloudflare:test";
import { beforeAll, beforeEach, describe, it, expect } from "vitest";
import worker from "../src/index";
import { Env } from "../src/types";
import { hex } from "../src/security";
const bindings = env as unknown as Env & { TEST_MIGRATIONS: any },
  job = "99".repeat(32),
  base = "https://registry.test/internal/jobs/" + job + "/multipart/";
async function call(
  path: string,
  body: any = {},
  headers: Record<string, string> = {},
  method = "POST",
) {
  return worker.fetch(
    new Request(base + path, {
      method,
      headers: { Authorization: "Bearer validator-secret", ...headers },
      body: body instanceof Uint8Array ? body : JSON.stringify(body),
    }),
    bindings,
  );
}
beforeAll(async () => applyD1Migrations(bindings.DB, bindings.TEST_MIGRATIONS));
beforeEach(async () => {
  for (const table of [
    "artifact_parts",
    "artifact_uploads",
    "submissions",
    "packages",
    "repository_publishers",
    "repositories",
    "publishers",
  ])
    await bindings.DB.prepare("DELETE FROM " + table).run();
  await bindings.DB.prepare(
    "INSERT INTO repositories VALUES(10,'owner/repo',20,1,1,1)",
  ).run();
  await bindings.DB.prepare(
    "INSERT INTO submissions(id,package_id,repository_id,release_id,asset_id,version,metadata,status,created_at,updated_at) VALUES(?,'example.app',10,30,40,'1','{}','validating',1,1)",
  )
    .bind(job)
    .run();
});
const checksum = async (bytes: Uint8Array) =>
  hex(await crypto.subtle.digest("SHA-256", bytes));
describe("bounded multipart ingestion", () => {
  it("assembles checksum-verified parts without publishing the candidate", async () => {
    const first = new Uint8Array(8 * 1024 * 1024).fill(7),
      last = new Uint8Array([1, 2, 3]),
      all = new Uint8Array(first.length + last.length);
    all.set(first);
    all.set(last, first.length);
    const sha = await checksum(all);
    const start = await call("start", { sha256: sha, size: all.length });
    expect(start.status).toBe(200);
    const state: any = await start.json(),
      headers = { "X-Upload-ID": state.upload_id };
    expect((await call("complete", {}, headers)).status).toBe(409);
    expect(
      (
        await call(
          "part/1",
          first,
          {
            ...headers,
            "Content-Length": String(first.length),
            "X-Checksum-SHA256": "0".repeat(64),
          },
          "PUT",
        )
      ).status,
    ).toBe(400);
    const partHeaders = {
      ...headers,
      "Content-Length": String(first.length),
      "X-Checksum-SHA256": await checksum(first),
    };
    expect((await call("part/1", first, partHeaders, "PUT")).status).toBe(200);
    expect((await call("part/1", first, partHeaders, "PUT")).status).toBe(200);
    expect(
      (
        await call(
          "part/2",
          last,
          {
            ...headers,
            "Content-Length": "3",
            "X-Checksum-SHA256": await checksum(last),
          },
          "PUT",
        )
      ).status,
    ).toBe(200);
    expect((await call("complete", {}, headers)).status).toBe(200);
    const row = await bindings.DB.prepare(
      "SELECT * FROM submissions WHERE id=?",
    )
      .bind(job)
      .first<any>();
    expect(row.status).toBe("validating");
    expect(row.sha256).toBe(sha);
    expect(row.size).toBe(all.length);
    const object = await bindings.PACKAGES.get(row.object_key);
    expect(await checksum(new Uint8Array(await object!.arrayBuffer()))).toBe(
      sha,
    );
  });
  it("binds parts to one active upload and permits explicit abort", async () => {
    expect((await call("start", { sha256: "bad", size: 1 })).status).toBe(400);
    const state: any = await (
      await call("start", { sha256: "a".repeat(64), size: 1 })
    ).json();
    expect((await call("abort", {}, { "X-Upload-ID": "wrong" })).status).toBe(
      409,
    );
    expect(
      (await call("start", { sha256: "b".repeat(64), size: 1 })).status,
    ).toBe(409);
    expect(
      (
        await call(
          "part/2",
          new Uint8Array([1]),
          {
            "X-Upload-ID": state.upload_id,
            "Content-Length": "1",
            "X-Checksum-SHA256": "a".repeat(64),
          },
          "PUT",
        )
      ).status,
    ).toBe(400);
    expect(
      (await call("abort", {}, { "X-Upload-ID": state.upload_id })).status,
    ).toBe(200);
    expect(
      await bindings.DB.prepare("SELECT * FROM artifact_uploads").first(),
    ).toBeNull();
  });
});
