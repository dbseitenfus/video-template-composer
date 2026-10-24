-- Detalhes do público, somados por dia, evento e dimensão (país, estado, cidade, operadora,
-- origem, campanha, navegador, sistema, idioma, horário...). Uma linha por valor, sem cruzar
-- dimensões: dá para saber quantos vieram do Instagram e quantos são do RS, mas não montar
-- o perfil de ninguém. Sem IP, sem cookie, sem identificador.
CREATE TABLE usage_dims (
  day TEXT NOT NULL,
  event TEXT NOT NULL,
  dim TEXT NOT NULL,
  value TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, event, dim, value)
);
