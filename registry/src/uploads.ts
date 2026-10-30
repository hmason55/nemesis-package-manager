import { Env, MAX_ZIP, now, requireValue } from "./types";
import { body, hex } from "./security";
const PART_SIZE = 8 * 1024 * 1024;
interface Upload {
  job_id: string;
  upload_id: string;
  object_key: string;
  sha256: string;
  size: number;
  created_at: number;
}
export async function multipart(
  request: Request,
  env: Env,
  job: any,
  suffix: string,
): Promise<Response> {
  if (suffix === "start" && request.method === "POST") {
    const input = await body(request);
    requireValue(
      /^[a-f0-9]{64}$/.test(input.sha256 || "") &&
        Number.isSafeInteger(input.size) &&
        input.size > 0 &&
        input.size <= MAX_ZIP,
      "Invalid upload identity",
    );
    const existing = await env.DB.prepare(
      "SELECT * FROM artifact_uploads WHERE job_id=?",
    )
      .bind(job.id)
      .first<Upload>();
    if (existing) {
      requireValue(
        existing.sha256 === input.sha256 && existing.size === input.size,
        "Upload identity cannot change",
        409,
      );
      return Response.json({
        upload_id: existing.upload_id,
        part_size: PART_SIZE,
      });
    }
    const key = "sha256/" + input.sha256 + "/" + job.id + ".zip";
    const upload = await env.PACKAGES.createMultipartUpload(key, {
      httpMetadata: { contentType: "application/zip" },
    });
    try {
      await env.DB.prepare("INSERT INTO artifact_uploads VALUES(?,?,?,?,?,?)")
        .bind(job.id, upload.uploadId, key, input.sha256, input.size, now())
        .run();
    } catch (error) {
      await upload.abort();
      throw error;
    }
    return Response.json({ upload_id: upload.uploadId, part_size: PART_SIZE });
  }
  const stored = await env.DB.prepare(
    "SELECT * FROM artifact_uploads WHERE job_id=?",
  )
    .bind(job.id)
    .first<Upload>();
  requireValue(
    stored && stored.upload_id === request.headers.get("X-Upload-ID"),
    "Active upload not found",
    409,
  );
  const upload = env.PACKAGES.resumeMultipartUpload(
    stored.object_key,
    stored.upload_id,
  );
  if (suffix === "abort" && request.method === "POST") {
    await upload.abort();
    await env.DB.prepare("DELETE FROM artifact_uploads WHERE job_id=?")
      .bind(job.id)
      .run();
    return Response.json({ ok: true });
  }
  const part = suffix.match(/^part\/(\d+)$/);
  if (part && request.method === "PUT") {
    const number = Number(part[1]),
      count = Math.ceil(stored.size / PART_SIZE),
      expected =
        number === count ? stored.size - (number - 1) * PART_SIZE : PART_SIZE;
    requireValue(
      number >= 1 &&
        number <= count &&
        Number(request.headers.get("Content-Length")) === expected &&
        request.body,
      "Invalid upload part",
    );
    const digest = request.headers.get("X-Checksum-SHA256") || "";
    requireValue(/^[a-f0-9]{64}$/.test(digest), "Missing part checksum");
    const reader = request.body.getReader(),
      chunks: Uint8Array[] = [];
    let length = 0;
    try {
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        length += next.value.byteLength;
        if (length > expected) {
          await reader.cancel();
          throw new Error("Part exceeds declared size");
        }
        chunks.push(next.value);
      }
    } finally {
      reader.releaseLock();
    }
    requireValue(length === expected, "Truncated upload part");
    const data = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      data.set(chunk, offset);
      offset += chunk.byteLength;
    }
    requireValue(
      hex(await crypto.subtle.digest("SHA-256", data)) === digest,
      "Part checksum mismatch",
    );
    const old = await env.DB.prepare(
      "SELECT * FROM artifact_parts WHERE job_id=? AND part_number=?",
    )
      .bind(job.id, number)
      .first<any>();
    if (old) {
      requireValue(old.sha256 === digest, "Uploaded part cannot change", 409);
      return Response.json({ part_number: number, etag: old.etag });
    }
    const result = await upload.uploadPart(number, data);
    await env.DB.prepare("INSERT INTO artifact_parts VALUES(?,?,?,?,?)")
      .bind(job.id, number, result.etag, digest, length)
      .run();
    await env.DB.prepare(
      "UPDATE submissions SET updated_at=? WHERE id=? AND status='validating'",
    )
      .bind(now(), job.id)
      .run();
    return Response.json({ part_number: number, etag: result.etag });
  }
  if (suffix === "complete" && request.method === "POST") {
    const parts = await env.DB.prepare(
      "SELECT * FROM artifact_parts WHERE job_id=? ORDER BY part_number",
    )
      .bind(job.id)
      .all<any>();
    requireValue(
      parts.results.length === Math.ceil(stored.size / PART_SIZE) &&
        parts.results.reduce((sum, p) => sum + p.size, 0) === stored.size,
      "Upload is incomplete",
      409,
    );
    const object = await upload.complete(
      parts.results.map((p) => ({ partNumber: p.part_number, etag: p.etag })),
    );
    requireValue(
      object.size === stored.size,
      "Completed artifact size mismatch",
    );
    await env.DB.batch([
      env.DB.prepare(
        "UPDATE submissions SET sha256=?,size=?,object_key=?,updated_at=? WHERE id=? AND status='validating'",
      ).bind(stored.sha256, stored.size, stored.object_key, now(), job.id),
      env.DB.prepare("DELETE FROM artifact_uploads WHERE job_id=?").bind(
        job.id,
      ),
    ]);
    return Response.json({ ok: true });
  }
  return new Response("Not found", { status: 404 });
}
export async function cleanupUploads(env: Env) {
  const rows = await env.DB.prepare(
    "SELECT u.* FROM artifact_uploads u JOIN submissions s ON s.id=u.job_id WHERE s.status<>'validating' OR s.updated_at<? LIMIT 10",
  )
    .bind(now() - 3600)
    .all<Upload>();
  for (const row of rows.results) {
    try {
      await env.PACKAGES.resumeMultipartUpload(
        row.object_key,
        row.upload_id,
      ).abort();
      await env.DB.prepare("DELETE FROM artifact_uploads WHERE job_id=?")
        .bind(row.job_id)
        .run();
    } catch {
      console.log(
        JSON.stringify({
          event: "multipart_cleanup_pending",
          subject: row.job_id,
        }),
      );
    }
  }
}
