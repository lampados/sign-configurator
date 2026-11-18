-- Anonymous click counter (SPEC §14): one row per event, without IP, cookies or personal data.
-- Run once in the console of the D1 database bound to Pages with the name STATS.
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('stl', 'request')),
  ts TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS events_type ON events (type);
