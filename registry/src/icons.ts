import { Env, Submission, now, requireValue } from "./types";
import { hex } from "./security";

export const iconUrl = (row: Submission, origin: string) =>
  row.icon_key
    ? origin +
      "/v1/packages/" +
      encodeURIComponent(row.package_id) +
      "/versions/" +
      encodeURIComponent(row.version) +
      "/icon"
    : "";

export async function uploadIcon(request: Request, env: Env, row: Submission) {
  const length = Number(request.headers.get("Content-Length"));
  requireValue(
    length >= 45 && length <= 262144,
    "Icons must be PNG files of at most 256 KiB",
  );
  const raw = await request.arrayBuffer(),
    data = new Uint8Array(raw),
    view = new DataView(raw);
  requireValue(
    raw.byteLength === length &&
      data
        .slice(0, 8)
        .every((v, i) => v === [137, 80, 78, 71, 13, 10, 26, 10][i]) &&
      view.getUint32(8) === 13 &&
      view.getUint32(12) === 0x49484452,
    "Invalid PNG icon",
  );
  requireValue(
    view.getUint32(16) > 0 &&
      view.getUint32(16) <= 512 &&
      view.getUint32(20) > 0 &&
      view.getUint32(20) <= 512,
    "Icons must be at most 512 by 512 pixels",
  );
  const digest = hex(await crypto.subtle.digest("SHA-256", raw)),
    key = "icons/sha256/" + digest + ".png";
  requireValue(
    request.headers.get("X-Checksum-SHA256") === digest,
    "Icon checksum mismatch",
  );
  await env.PACKAGES.put(key, raw, {
    sha256: digest,
    httpMetadata: { contentType: "image/png" },
  });
  const changed = await env.DB.prepare(
    "UPDATE submissions SET icon_key=?,updated_at=? WHERE id=? AND status='validating'",
  )
    .bind(key, now(), row.id)
    .run();
  requireValue(changed.meta.changes === 1, "Validation no longer active", 409);
  return Response.json({ ok: true });
}

export async function serveIcon(env: Env, row: Submission) {
  requireValue(row.icon_key, "Package icon not found", 404);
  const object = await env.PACKAGES.get(row.icon_key);
  requireValue(object, "Package icon unavailable", 404);
  return new Response(object.body, {
    headers: {
      "Content-Type": "image/png",
      "Content-Length": String(object.size),
      "Content-Security-Policy": "default-src 'none'",
      "Cache-Control": "no-store",
    },
  });
}
