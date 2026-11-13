ALTER TABLE agent_records ADD COLUMN channel_id TEXT;
ALTER TABLE agent_records ADD COLUMN provisioning_until INTEGER NOT NULL DEFAULT 0;
