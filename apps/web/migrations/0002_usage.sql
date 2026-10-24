-- Contadores de uso anônimos: só somas por dia, evento, modelo e tipo de aparelho.
-- Nada que identifique pessoas (sem IP, sem cookie, sem conteúdo dos vídeos).
CREATE TABLE usage_daily (
  day TEXT NOT NULL,
  event TEXT NOT NULL,
  template_id TEXT NOT NULL DEFAULT '',
  device TEXT NOT NULL DEFAULT 'other',
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, event, template_id, device)
);
