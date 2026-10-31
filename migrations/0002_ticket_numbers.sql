ALTER TABLE tickets ADD COLUMN ticket_number INTEGER;
CREATE UNIQUE INDEX ticket_number_per_guild ON tickets(guild_id,ticket_number);
CREATE TABLE ticket_counters (guild_id TEXT PRIMARY KEY, last_number INTEGER NOT NULL);
