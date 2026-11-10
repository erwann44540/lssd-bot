CREATE TABLE recruitment_drafts (
  id TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  step INTEGER NOT NULL,
  answers TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX recruitment_drafts_expiry ON recruitment_drafts(expires_at);
