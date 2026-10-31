CREATE TABLE config (guild_id TEXT PRIMARY KEY, role_id TEXT NOT NULL, category_id TEXT NOT NULL);
CREATE TABLE tickets (id TEXT PRIMARY KEY, guild_id TEXT NOT NULL, user_id TEXT NOT NULL, channel_id TEXT, thread_id TEXT, status TEXT NOT NULL DEFAULT 'creating', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE UNIQUE INDEX one_open_ticket ON tickets(guild_id,user_id) WHERE status IN ('creating','open');
CREATE UNIQUE INDEX ticket_channel ON tickets(channel_id);
