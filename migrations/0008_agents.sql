CREATE TABLE agent_records (
  id TEXT PRIMARY KEY,
  matricule TEXT NOT NULL UNIQUE,
  data TEXT NOT NULL,
  message_id TEXT,
  revision INTEGER NOT NULL DEFAULT 0,
  deleted INTEGER NOT NULL DEFAULT 0
);
