-- Controle de pescaria: eventos, equipes, pescadores, custos fixos, adiantamentos e despesas rateadas
-- Rode este script uma vez no SQL Editor do Supabase (Postgres)

CREATE TABLE IF NOT EXISTS eventos (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome TEXT NOT NULL,
  local TEXT,
  ano INTEGER,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS equipes (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  evento_id BIGINT NOT NULL REFERENCES eventos(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  piloto_nome TEXT,
  piloto_contato TEXT
);

CREATE TABLE IF NOT EXISTS pescadores (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  equipe_id BIGINT NOT NULL REFERENCES equipes(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  a_confirmar BOOLEAN NOT NULL DEFAULT false
);

-- Despesas fixas individuais (hospedagem, piloto/embarcação, camisas, avulsas, etc.)
CREATE TABLE IF NOT EXISTS custos_fixos (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pescador_id BIGINT NOT NULL REFERENCES pescadores(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,
  descricao TEXT,
  valor NUMERIC NOT NULL DEFAULT 0
);

-- Adiantamentos pagos por cada pescador
CREATE TABLE IF NOT EXISTS adiantamentos (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pescador_id BIGINT NOT NULL REFERENCES pescadores(id) ON DELETE CASCADE,
  valor NUMERIC NOT NULL DEFAULT 0,
  data TEXT,
  observacao TEXT
);

-- Despesas rateadas entre um grupo de pescadores (combustível, iscas, etc.)
CREATE TABLE IF NOT EXISTS despesas_rateadas (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  equipe_id BIGINT REFERENCES equipes(id) ON DELETE CASCADE,
  descricao TEXT NOT NULL,
  valor_total NUMERIC NOT NULL DEFAULT 0,
  data TEXT
);

CREATE TABLE IF NOT EXISTS despesa_rateada_participantes (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  despesa_rateada_id BIGINT NOT NULL REFERENCES despesas_rateadas(id) ON DELETE CASCADE,
  pescador_id BIGINT NOT NULL REFERENCES pescadores(id) ON DELETE CASCADE,
  UNIQUE(despesa_rateada_id, pescador_id)
);
