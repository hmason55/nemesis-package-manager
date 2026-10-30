CREATE TABLE artifact_uploads (
  job_id TEXT PRIMARY KEY REFERENCES submissions(id),
  upload_id TEXT NOT NULL,
  object_key TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE artifact_parts (
  job_id TEXT NOT NULL REFERENCES artifact_uploads(job_id) ON DELETE CASCADE,
  part_number INTEGER NOT NULL,
  etag TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  size INTEGER NOT NULL,
  PRIMARY KEY(job_id,part_number)
);
