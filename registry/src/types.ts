export interface Env {
  DB: D1Database;
  PACKAGES: R2Bucket;
  SITE_URL: string;
  GITHUB_APP_ID: string;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  GITHUB_PRIVATE_KEY: string;
  GITHUB_WEBHOOK_SECRET: string;
  SESSION_ENCRYPTION_KEY: string;
  VALIDATOR_TOKEN: string;
  GITHUB_DISPATCH_TOKEN: string;
  ADMIN_IDS: string;
  VALIDATOR_REPOSITORY: string;
  GITHUB_APP_SLUG: string;
  VALIDATION_ENVIRONMENT: string;
}
export interface Metadata {
  name: string;
  description: string;
  categories: string[];
  compatibility: { vehicles: string[]; firmware: string[]; nemesis: string };
  release_notes: string;
}
export interface Submission {
  id: string;
  package_id: string;
  repository_id: number;
  publisher_id: number | null;
  release_id: number;
  asset_id: number;
  version: string;
  metadata: string;
  status: string;
  sha256: string;
  size: number;
  object_key: string;
  icon_key?: string | null;
  source_actor_id?: number | null;
  release_author_id?: number | null;
  report: string;
  created_at: number;
}
export interface Session {
  publisher_id: number;
  github_token: string;
  login: string;
}
export const MAX_ZIP = 512 * 1024 * 1024;
export const now = () => Math.floor(Date.now() / 1000);
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function requireValue(
  condition: unknown,
  message: string,
  status = 400,
): asserts condition {
  if (!condition) throw new HttpError(status, message);
}
export function packageId(value: unknown): string {
  requireValue(
    typeof value === "string" &&
      /^[A-Za-z0-9_-][A-Za-z0-9._-]{0,63}$/.test(value) &&
      !value.includes(".."),
    "Invalid NEMESIS package ID",
  );
  return value;
}
export function versionText(value: unknown): string {
  requireValue(
    typeof value === "string" &&
      value.length > 0 &&
      value.length <= 128 &&
      !/[\x00-\x1f/\\]/.test(value),
    "Invalid version",
  );
  return value;
}
export function metadata(value: any): Metadata {
  requireValue(
    value &&
      typeof value.name === "string" &&
      value.name.trim().length > 0 &&
      value.name.length <= 160,
    "Supply a package name",
  );
  requireValue(
    typeof value.description === "string" && value.description.length <= 10000,
    "Invalid description",
  );
  const list = (v: unknown): string[] => {
    requireValue(
      Array.isArray(v) &&
        v.length <= 30 &&
        v.every((x) => typeof x === "string" && x.length <= 160),
      "Invalid metadata list",
    );
    return v;
  };
  const c = value.compatibility ?? {};
  requireValue(
    typeof c === "object" &&
      !Array.isArray(c) &&
      (c.nemesis === undefined ||
        (typeof c.nemesis === "string" && c.nemesis.length <= 160)),
    "Invalid compatibility declarations",
  );
  requireValue(
    typeof value.release_notes === "string" &&
      value.release_notes.length <= 20000,
    "Invalid release notes",
  );
  return {
    name: value.name.trim(),
    description: value.description,
    categories: list(value.categories),
    compatibility: {
      vehicles: list(c.vehicles === undefined ? [] : c.vehicles),
      firmware: list(c.firmware === undefined ? [] : c.firmware),
      nemesis: c.nemesis || "",
    },
    release_notes: value.release_notes,
  };
}
