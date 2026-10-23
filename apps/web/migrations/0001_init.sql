-- Templates: o rascunho é editável; cada publicação vira uma versão imutável.
CREATE TABLE templates (
  id TEXT PRIMARY KEY,
  draft TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE template_versions (
  template_id TEXT NOT NULL REFERENCES templates(id),
  version INTEGER NOT NULL,
  json TEXT NOT NULL,
  published_at INTEGER NOT NULL,
  PRIMARY KEY (template_id, version)
);

-- Arquivos no R2. A chave é derivada do conteúdo (sha-256), então nunca muda e pode ter cache eterno.
CREATE TABLE assets (
  key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('image', 'audio', 'video')),
  size INTEGER NOT NULL,
  width INTEGER,
  height INTEGER,
  duration REAL,
  created_at INTEGER NOT NULL
);
