-- Development fixture only. Load with wrangler d1 execute ... --local --file test/seed.sql.
INSERT OR IGNORE INTO publishers VALUES(123,'example-publisher');
INSERT OR IGNORE INTO repositories VALUES(123,'example-publisher/example-package',123,123,1,1);
-- Timestamp only the development fixture when this local seed is reloaded.
INSERT OR IGNORE INTO packages VALUES('example.app',123,'{"name":"Example utility","description":"A development fixture demonstrating registry browsing. This is not a real installable release.","categories":["Utilities"],"compatibility":{"vehicles":["Example vehicle"],"firmware":["Publisher requirements"],"nemesis":"See package instructions"},"release_notes":"Development preview only."}');
INSERT OR IGNORE INTO submissions(id,package_id,repository_id,publisher_id,release_id,asset_id,version,metadata,status,sha256,size,object_key,report,created_at,updated_at) SELECT 'development-fixture','example.app',123,123,123,123,'1.2.0',metadata,'approved','0000000000000000000000000000000000000000000000000000000000000000',1,'development-fixture','Development fixture; no binary',1,1 FROM packages WHERE id='example.app';
UPDATE submissions SET created_at=unixepoch(),updated_at=unixepoch() WHERE id='development-fixture';
