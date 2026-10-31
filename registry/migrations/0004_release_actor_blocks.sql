ALTER TABLE release_events ADD COLUMN actor_id INTEGER;
ALTER TABLE submissions ADD COLUMN source_actor_id INTEGER;
ALTER TABLE submissions ADD COLUMN release_author_id INTEGER;
