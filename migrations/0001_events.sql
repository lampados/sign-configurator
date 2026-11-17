-- Contatore anonimo dei click (SPEC §14): una riga per evento, senza IP, cookie o dati personali.
-- Si esegue una volta nella console del database D1 collegato a Pages con il nome STATS.
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('stl', 'request')),
  ts TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS events_type ON events (type);
