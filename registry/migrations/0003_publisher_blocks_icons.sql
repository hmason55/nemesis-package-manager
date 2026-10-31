CREATE TABLE blocked_publishers (publisher_id INTEGER PRIMARY KEY, reason TEXT NOT NULL, created_at INTEGER NOT NULL, actor_id INTEGER NOT NULL);
ALTER TABLE submissions ADD COLUMN icon_key TEXT;
