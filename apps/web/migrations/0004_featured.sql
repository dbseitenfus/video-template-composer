-- Template em destaque ("em alta") na página inicial. No máximo um por vez; fica fora do JSON
-- do template, como a ordem e o arquivamento, para não exigir uma nova versão publicada.
ALTER TABLE templates ADD COLUMN featured INTEGER NOT NULL DEFAULT 0;
