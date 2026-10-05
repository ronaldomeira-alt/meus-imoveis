-- ==============================================================================
-- REVISÃO MASTER: PREFERÊNCIAS PERSISTENTES DOS AGENTES, AUDITORIA DE CONFIGURAÇÃO
-- E ROTINA EDITORIAL DIÁRIA DO MARKETING ÀS 19:00 AMERICA/SAO_PAULO
-- ==============================================================================

-- 1. Tabela de Preferências Persistentes de Comportamento dos Agentes
create table if not exists public.agent_preferences (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  bot_id uuid not null references public.agent_bots(id) on delete cascade,
  communication_preferences jsonb not null default '{}'::jsonb,
  behavior_preferences jsonb not null default '{}'::jsonb,
  research_preferences jsonb not null default '{}'::jsonb,
  notification_preferences jsonb not null default '{}'::jsonb,
  operational_preferences jsonb not null default '{}'::jsonb,
  previous_state jsonb,
  updated_by text not null default 'user',
  updated_at timestamptz not null default now(),
  unique (account_id, bot_id)
);

create index if not exists idx_agent_pref_account_bot on public.agent_preferences(account_id, bot_id);

-- 2. Tabela de Auditoria de Configurações Alteradas pelo Gestor ou Usuário
create table if not exists public.agent_config_audit (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  bot_id uuid not null references public.agent_bots(id) on delete cascade,
  changed_by text not null default 'gestor_chat',
  category text not null,
  previous_value jsonb,
  new_value jsonb,
  reason text,
  requires_confirmation boolean not null default false,
  confirmed boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_agent_config_audit_lookup on public.agent_config_audit(account_id, bot_id, created_at desc);

-- 3. Habilitação de RLS e Políticas Multi-Tenant
do $$
declare t text;
begin
  foreach t in array array['agent_preferences', 'agent_config_audit'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('drop policy if exists account_read on public.%I', t);
    execute format(
      'create policy account_read on public.%I for select to authenticated using (account_id = public.current_inventory_account_id())',
      t
    );
  end loop;
end $$;

-- 4. Gatilho de Background do Bot de Marketing: Pesquisa Editorial Diária às 19:00 America/Sao_Paulo (22:00 UTC)
select cron.schedule('central-marketing-daily-editorial', '0 22 * * *', $job$
  select net.http_post(
    url := r.function_url,
    headers := jsonb_build_object('Content-Type','application/json','x-central-cron',r.cron_secret),
    body := jsonb_build_object('action','tick','account_id',r.account_id,'bot_id',b.id,'job_type','daily_editorial'),
    timeout_milliseconds := 120000
  ) from public.agent_runtime_settings r
    join public.agent_bots b on b.account_id = r.account_id and b.kind = 'marketing'
    where r.enabled and b.active;
$job$);
