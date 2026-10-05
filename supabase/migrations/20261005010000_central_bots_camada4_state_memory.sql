begin;

-- ==============================================================================
-- CAMADA 4 — ESTADO OPERACIONAL PERSISTENTE E MEMÓRIA OPERACIONAL DOS AGENTES
-- ==============================================================================

-- 1. Estado Operacional Estruturado por Agente (1 linha por conta e bot)
create table if not exists public.agent_operational_state (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  bot_id uuid not null,
  last_interaction_at timestamptz,
  last_operational_at timestamptz,
  last_operational_type text,
  last_operational_summary text,
  current_focus text,
  pending_items jsonb not null default '[]'::jsonb,
  watched_items jsonb not null default '[]'::jsonb,
  last_result_summary text,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (account_id, bot_id),
  foreign key (account_id, bot_id) references public.agent_bots(account_id, id) on delete cascade
);

-- 2. Memória Operacional Estruturada com Expiração (Contexto Relevante, não memory dump)
create table if not exists public.agent_operational_memories (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  bot_id uuid not null,
  kind text not null check (kind in ('research', 'investigation', 'editorial', 'context', 'observation', 'decision')),
  topic text not null default '',
  summary text not null check (length(summary) between 1 and 4000),
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz,
  foreign key (account_id, bot_id) references public.agent_bots(account_id, id) on delete cascade
);

create index if not exists agent_operational_memories_lookup
  on public.agent_operational_memories(account_id, bot_id, kind, updated_at desc);

create index if not exists agent_operational_memories_retention
  on public.agent_operational_memories(expires_at) where expires_at is not null;

-- RLS e Permissões Seguras Multi-Tenant
do $$
declare t text;
begin
  foreach t in array array['agent_operational_state', 'agent_operational_memories'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('drop policy if exists account_read on public.%I', t);
    execute format(
      'create policy account_read on public.%I for select to authenticated using (account_id = public.current_inventory_account_id()%s)',
      t,
      case when t = 'agent_operational_memories' then ' and (expires_at is null or expires_at > now())' else '' end
    );
  end loop;
end $$;

commit;
