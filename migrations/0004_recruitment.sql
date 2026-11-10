ALTER TABLE config ADD COLUMN recruitment_command_id TEXT;
ALTER TABLE config ADD COLUMN ce_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE config ADD COLUMN panel_channel_id TEXT;
ALTER TABLE config ADD COLUMN panel_message_id TEXT;
CREATE TABLE ticket_notices (
  ticket_id TEXT NOT NULL REFERENCES tickets(id),
  slot TEXT NOT NULL,
  interaction_id TEXT NOT NULL UNIQUE,
  PRIMARY KEY (ticket_id, slot)
);
