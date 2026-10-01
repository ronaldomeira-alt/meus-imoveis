-- ==============================================================================
-- MIGRATION: Módulo Bot Captador — Meus Imóveis
-- Data: 2026-10-01
-- Descrição: Tabelas, índices, tombstones de deduplicação, RPCs atômicas e RLS
-- ==============================================================================

BEGIN;

-- 1. Configurações Globais do Bot Captador por Conta
CREATE TABLE IF NOT EXISTS public.bot_settings (
  account_id uuid PRIMARY KEY REFERENCES public.accounts(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT false,
  health_status text NOT NULL DEFAULT 'active' CHECK (health_status IN ('active', 'paused', 'attention', 'error')),
  health_reason text,
  last_round_at timestamptz,
  next_round_at timestamptz,
  last_round_summary text,
  retention_days integer NOT NULL DEFAULT 40,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Campanhas Independentes (Venda e Locação)
CREATE TABLE IF NOT EXISTS public.bot_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('venda', 'locacao')),
  is_active boolean NOT NULL DEFAULT false,
  neighborhoods text[] NOT NULL DEFAULT '{}',
  min_price numeric,
  max_price numeric,
  min_bedrooms integer,
  max_bedrooms integer,
  min_area numeric,
  max_area numeric,
  only_private boolean NOT NULL DEFAULT true,
  rounds_per_day integer NOT NULL DEFAULT 2 CHECK (rounds_per_day IN (1, 2)),
  schedule_times text[] NOT NULL DEFAULT ARRAY['09:00', '19:00'],
  max_contacts_per_round integer NOT NULL DEFAULT 10,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bot_campaigns_account_type_unique UNIQUE (account_id, type)
);

-- 3. Mensagens de Abordagem Cadastradas
CREATE TABLE IF NOT EXISTS public.bot_message_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  title text NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 4. Fila e Histórico Operacional de Captações
CREATE TABLE IF NOT EXISTS public.bot_captures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  campaign_type text NOT NULL CHECK (campaign_type IN ('venda', 'locacao')),
  provider text NOT NULL DEFAULT 'olx',
  external_id text,
  url text NOT NULL,
  normalized_url text NOT NULL,
  fingerprint text NOT NULL,
  title text NOT NULL,
  price numeric,
  neighborhood text,
  bedrooms integer,
  area_m2 numeric,
  owner_name text,
  owner_contact text,
  status text NOT NULL DEFAULT 'QUEUED' CHECK (
    status IN (
      'DISCOVERED',
      'QUEUED',
      'RESERVED',
      'CONTACTED',
      'WAITING_RESPONSE',
      'RESPONDED',
      'IMPORTED',
      'ARCHIVED',
      'EXPIRED',
      'FAILED',
      'POSSIBLE_DUPLICATE'
    )
  ),
  message_template_id uuid REFERENCES public.bot_message_templates(id) ON DELETE SET NULL,
  message_sent_snapshot text,
  reserved_at timestamptz,
  contacted_at timestamptz,
  responded_at timestamptz,
  imported_property_id text,
  rejection_reason text,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bot_captures_unique_account_url UNIQUE (account_id, normalized_url),
  CONSTRAINT bot_captures_unique_account_fingerprint UNIQUE (account_id, fingerprint)
);

-- 5. Tombstones Perpétuos de Deduplicação (Memória Permanente Mínima)
CREATE TABLE IF NOT EXISTS public.bot_capture_tombstones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  fingerprint text NOT NULL,
  normalized_url text NOT NULL,
  external_id text,
  first_contacted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bot_capture_tombstones_unique_fingerprint UNIQUE (account_id, fingerprint)
);

-- 6. Histórico de Rodadas de Execução
CREATE TABLE IF NOT EXISTS public.bot_execution_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  campaign_type text NOT NULL CHECK (campaign_type IN ('venda', 'locacao', 'both')),
  trigger_type text NOT NULL CHECK (trigger_type IN ('SCHEDULED', 'MANUAL', 'SIMULATION')),
  status text NOT NULL DEFAULT 'RUNNING' CHECK (status IN ('RUNNING', 'COMPLETED', 'FAILED', 'INTERRUPTED')),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  analyzed_count integer NOT NULL DEFAULT 0,
  new_count integer NOT NULL DEFAULT 0,
  eligible_count integer NOT NULL DEFAULT 0,
  contacted_count integer NOT NULL DEFAULT 0,
  duplicate_count integer NOT NULL DEFAULT 0,
  error_count integer NOT NULL DEFAULT 0,
  error_summary text,
  details jsonb DEFAULT '{}'::jsonb
);

-- ── Índices de Performance e Consulta ───────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_bot_captures_account_status_queue
  ON public.bot_captures (account_id, campaign_type, status, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_bot_captures_expires
  ON public.bot_captures (account_id, status, expires_at);

CREATE INDEX IF NOT EXISTS idx_bot_captures_contacted_at
  ON public.bot_captures (account_id, contacted_at DESC);

CREATE INDEX IF NOT EXISTS idx_bot_captures_responded_at
  ON public.bot_captures (account_id, responded_at DESC);

CREATE INDEX IF NOT EXISTS idx_bot_captures_imported_id
  ON public.bot_captures (account_id, imported_property_id);

CREATE INDEX IF NOT EXISTS idx_bot_tombstones_lookup
  ON public.bot_capture_tombstones (account_id, fingerprint, normalized_url);

CREATE INDEX IF NOT EXISTS idx_bot_rounds_history
  ON public.bot_execution_rounds (account_id, started_at DESC);

-- ── Habilitação de RLS (Row Level Security) ───────────────────────────────────
ALTER TABLE public.bot_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_message_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_captures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_capture_tombstones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_execution_rounds ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS vinculadas a public.current_inventory_account_id()
DROP POLICY IF EXISTS bot_settings_own ON public.bot_settings;
CREATE POLICY bot_settings_own ON public.bot_settings
  FOR ALL TO authenticated
  USING (account_id = public.current_inventory_account_id())
  WITH CHECK (account_id = public.current_inventory_account_id());

DROP POLICY IF EXISTS bot_campaigns_own ON public.bot_campaigns;
CREATE POLICY bot_campaigns_own ON public.bot_campaigns
  FOR ALL TO authenticated
  USING (account_id = public.current_inventory_account_id())
  WITH CHECK (account_id = public.current_inventory_account_id());

DROP POLICY IF EXISTS bot_templates_own ON public.bot_message_templates;
CREATE POLICY bot_templates_own ON public.bot_message_templates
  FOR ALL TO authenticated
  USING (account_id = public.current_inventory_account_id())
  WITH CHECK (account_id = public.current_inventory_account_id());

DROP POLICY IF EXISTS bot_captures_own ON public.bot_captures;
CREATE POLICY bot_captures_own ON public.bot_captures
  FOR ALL TO authenticated
  USING (account_id = public.current_inventory_account_id())
  WITH CHECK (account_id = public.current_inventory_account_id());

DROP POLICY IF EXISTS bot_tombstones_own ON public.bot_capture_tombstones;
CREATE POLICY bot_tombstones_own ON public.bot_capture_tombstones
  FOR ALL TO authenticated
  USING (account_id = public.current_inventory_account_id())
  WITH CHECK (account_id = public.current_inventory_account_id());

DROP POLICY IF EXISTS bot_rounds_own ON public.bot_execution_rounds;
CREATE POLICY bot_rounds_own ON public.bot_execution_rounds
  FOR ALL TO authenticated
  USING (account_id = public.current_inventory_account_id())
  WITH CHECK (account_id = public.current_inventory_account_id());

GRANT ALL ON public.bot_settings TO authenticated;
GRANT ALL ON public.bot_campaigns TO authenticated;
GRANT ALL ON public.bot_message_templates TO authenticated;
GRANT ALL ON public.bot_captures TO authenticated;
GRANT ALL ON public.bot_capture_tombstones TO authenticated;
GRANT ALL ON public.bot_execution_rounds TO authenticated;

-- ── Funções RPC Atômicas com Proteção contra Concorrência ──────────────────────

-- 1. Reserva atômica do próximo candidato da fila (FIFO com FOR UPDATE SKIP LOCKED)
CREATE OR REPLACE FUNCTION public.reserve_next_bot_candidate(
  p_account_id uuid,
  p_campaign_type text,
  p_template_id uuid
)
RETURNS TABLE (
  capture_id uuid,
  url text,
  title text,
  owner_name text,
  fingerprint text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_capture_id uuid;
BEGIN
  -- Bloqueio transacional de concorrência por conta e campanha
  PERFORM pg_advisory_xact_lock(hashtextextended(p_account_id::text || p_campaign_type, 0));

  -- Expira itens com mais de 7 dias antes da reserva
  UPDATE public.bot_captures
  SET status = 'EXPIRED', updated_at = now()
  WHERE account_id = p_account_id
    AND status = 'QUEUED'
    AND expires_at < now();

  -- Seleciona o item elegível mais antigo que não esteja bloqueado
  SELECT c.id INTO v_capture_id
  FROM public.bot_captures c
  WHERE c.account_id = p_account_id
    AND c.campaign_type = p_campaign_type
    AND c.status = 'QUEUED'
    AND c.expires_at >= now()
    AND NOT EXISTS (
      SELECT 1 FROM public.bot_capture_tombstones t
      WHERE t.account_id = p_account_id AND t.fingerprint = c.fingerprint
    )
  ORDER BY c.created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_capture_id IS NOT NULL THEN
    UPDATE public.bot_captures
    SET status = 'RESERVED',
        reserved_at = now(),
        message_template_id = p_template_id,
        updated_at = now()
    WHERE id = v_capture_id;

    RETURN QUERY
    SELECT c.id, c.url, c.title, c.owner_name, c.fingerprint
    FROM public.bot_captures c
    WHERE c.id = v_capture_id;
  END IF;
END;
$$;

-- 2. Confirmação atômica de envio: transita de RESERVED para WAITING_RESPONSE e cria Tombstone
CREATE OR REPLACE FUNCTION public.confirm_bot_capture_contacted(
  p_capture_id uuid,
  p_message_snapshot text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rec record;
BEGIN
  SELECT * INTO v_rec
  FROM public.bot_captures
  WHERE id = p_capture_id
  FOR UPDATE;

  IF NOT FOUND OR v_rec.status NOT IN ('RESERVED', 'QUEUED') THEN
    RETURN false;
  END IF;

  -- Atualiza captação para WAITING_RESPONSE
  UPDATE public.bot_captures
  SET status = 'WAITING_RESPONSE',
      contacted_at = now(),
      message_sent_snapshot = p_message_snapshot,
      updated_at = now()
  WHERE id = p_capture_id;

  -- Registra no Tombstone perpétuo
  INSERT INTO public.bot_capture_tombstones (account_id, fingerprint, normalized_url, external_id, first_contacted_at)
  VALUES (v_rec.account_id, v_rec.fingerprint, v_rec.normalized_url, v_rec.external_id, now())
  ON CONFLICT (account_id, fingerprint) DO NOTHING;

  RETURN true;
END;
$$;

-- 3. Vinculação atômica de Captação ao Imóvel Importado (Métrica Real de Conversão)
CREATE OR REPLACE FUNCTION public.mark_bot_capture_imported(
  p_capture_id uuid,
  p_property_id text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.bot_captures
  SET status = 'IMPORTED',
      imported_property_id = p_property_id,
      updated_at = now()
  WHERE id = p_capture_id;

  RETURN FOUND;
END;
$$;

-- 4. Limpeza de dados operacionais (Retenção 40 dias preservando Tombstones)
CREATE OR REPLACE FUNCTION public.purge_expired_bot_operations(p_account_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_purged integer := 0;
BEGIN
  -- Arquiva captações aguardando há mais de 7 dias sem resposta
  UPDATE public.bot_captures
  SET status = 'ARCHIVED', updated_at = now()
  WHERE account_id = p_account_id
    AND status = 'WAITING_RESPONSE'
    AND contacted_at < (now() - interval '7 days');

  -- Remove registros operacionais concluídos mais antigos que 40 dias
  -- NOTA: O Tombstone perpétuo em bot_capture_tombstones NUNCA é removido!
  DELETE FROM public.bot_captures
  WHERE account_id = p_account_id
    AND status IN ('ARCHIVED', 'EXPIRED', 'FAILED')
    AND created_at < (now() - interval '40 days');
  
  GET DIAGNOSTICS v_purged = ROW_COUNT;
  RETURN v_purged;
END;
$$;

COMMIT;
