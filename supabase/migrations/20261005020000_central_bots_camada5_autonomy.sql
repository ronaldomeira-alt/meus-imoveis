-- ==============================================================================
-- CAMADA 5: AUTONOMIA FORA DO CHAT, JOBS IDEMPOTENTES E NOTIFICAÇÕES ANTI-SPAM
-- Isolada, multi-tenant (account_id), RLS habilitado e estritamente read-only
-- em relação ao Bot Captador operacional existente.
-- ==============================================================================

-- 1. Tabela de Execuções e Slots Autônomos (Garante idempotência, concorrência e retry)
create table if not exists public.agent_autonomous_jobs (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  bot_id uuid not null references public.agent_bots(id) on delete cascade,
  job_type text not null,
  slot_key text not null,
  status text not null default 'pending' check (status in ('pending', 'running', 'completed', 'failed', 'skipped')),
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  lease_until timestamptz,
  result_summary text,
  data jsonb not null default '{}'::jsonb,
  error text,
  notified boolean not null default false,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  unique (account_id, bot_id, job_type, slot_key)
);

create index if not exists idx_agent_auto_jobs_slot on public.agent_autonomous_jobs(account_id, bot_id, slot_key);
create index if not exists idx_agent_auto_jobs_status on public.agent_autonomous_jobs(status, lease_until);

-- 2. Tabela de Registro de Notificações com Cooldown Anti-Spam
create table if not exists public.agent_notifications_log (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  bot_id uuid not null references public.agent_bots(id) on delete cascade,
  kind text not null check (kind in ('daily_digest', 'important_alert', 'critical_alert', 'opportunity', 'resolved')),
  dedup_key text not null,
  title text not null,
  body text not null,
  severity text not null default 'medium' check (severity in ('low', 'medium', 'high', 'critical')),
  sent_at timestamptz not null default now(),
  cooldown_until timestamptz,
  payload jsonb not null default '{}'::jsonb,
  unique (account_id, bot_id, dedup_key)
);

create index if not exists idx_agent_notif_dedup on public.agent_notifications_log(account_id, bot_id, dedup_key);

-- 3. Habilitação de RLS e Políticas de Segurança
do $$
declare t text;
begin
  foreach t in array array['agent_autonomous_jobs', 'agent_notifications_log'] loop
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

-- 4. Função Atômica de Claim com Idempotência, Lease de Concorrência e Retry Limitado
create or replace function public.agent_claim_autonomous_job(
  p_account_id uuid,
  p_bot_id uuid,
  p_job_type text,
  p_slot_key text,
  p_lease_seconds integer default 300
)
returns table (
  id uuid,
  account_id uuid,
  bot_id uuid,
  job_type text,
  slot_key text,
  status text,
  attempts integer,
  max_attempts integer,
  lease_until timestamptz,
  result_summary text,
  data jsonb,
  error text,
  notified boolean,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz,
  claimed boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_job public.agent_autonomous_jobs;
begin
  -- Insere o job caso ainda não exista no slot
  insert into public.agent_autonomous_jobs (account_id, bot_id, job_type, slot_key, status)
  values (p_account_id, p_bot_id, p_job_type, p_slot_key, 'pending')
  on conflict (account_id, bot_id, job_type, slot_key) do nothing;

  -- Seleciona e bloqueia para atualização atômica
  select * into v_job
  from public.agent_autonomous_jobs
  where agent_autonomous_jobs.account_id = p_account_id
    and agent_autonomous_jobs.bot_id = p_bot_id
    and agent_autonomous_jobs.job_type = p_job_type
    and agent_autonomous_jobs.slot_key = p_slot_key
  for update;

  -- Se já estiver concluído, retorna com status='completed' (idempotente)
  if v_job.status = 'completed' then
    return query select v_job.id, v_job.account_id, v_job.bot_id, v_job.job_type, v_job.slot_key, v_job.status, v_job.attempts, v_job.max_attempts, v_job.lease_until, v_job.result_summary, v_job.data, v_job.error, v_job.notified, v_job.started_at, v_job.finished_at, v_job.created_at, false as claimed;
    return;
  end if;

  -- Se já estiver em execução e o lease ainda não expirou, retorna com status='running' (lock ativo)
  if v_job.status = 'running' and v_job.lease_until is not null and v_job.lease_until > now() then
    return query select v_job.id, v_job.account_id, v_job.bot_id, v_job.job_type, v_job.slot_key, v_job.status, v_job.attempts, v_job.max_attempts, v_job.lease_until, v_job.result_summary, v_job.data, v_job.error, v_job.notified, v_job.started_at, v_job.finished_at, v_job.created_at, false as claimed;
    return;
  end if;

  -- Se falhou e atingiu tentativas máximas, retorna com status='failed'
  if v_job.status = 'failed' and v_job.attempts >= v_job.max_attempts then
    return query select v_job.id, v_job.account_id, v_job.bot_id, v_job.job_type, v_job.slot_key, v_job.status, v_job.attempts, v_job.max_attempts, v_job.lease_until, v_job.result_summary, v_job.data, v_job.error, v_job.notified, v_job.started_at, v_job.finished_at, v_job.created_at, false as claimed;
    return;
  end if;

  -- Caso contrário, reivindica a execução do job
  update public.agent_autonomous_jobs
  set status = 'running',
      attempts = agent_autonomous_jobs.attempts + 1,
      lease_until = now() + (p_lease_seconds || ' seconds')::interval,
      started_at = coalesce(agent_autonomous_jobs.started_at, now())
  where agent_autonomous_jobs.id = v_job.id
  returning * into v_job;

  return query select v_job.id, v_job.account_id, v_job.bot_id, v_job.job_type, v_job.slot_key, v_job.status, v_job.attempts, v_job.max_attempts, v_job.lease_until, v_job.result_summary, v_job.data, v_job.error, v_job.notified, v_job.started_at, v_job.finished_at, v_job.created_at, true as claimed;
  return;
end;
$$;

revoke all on function public.agent_claim_autonomous_job(uuid, uuid, text, text, integer) from public, anon, authenticated;
grant execute on function public.agent_claim_autonomous_job(uuid, uuid, text, text, integer) to service_role;

-- 5. Trigger em Background do Bot Gestor (Resumo Diário às 19:30 America/Sao_Paulo = 22:30 UTC)
-- Executa de forma totalmente autônoma pelo backend via pg_cron + pg_net sem depender de frontend ou sessão ativa
select cron.schedule('central-gestor-daily', '30 22 * * *', $job$
  select net.http_post(
    url := r.function_url,
    headers := jsonb_build_object('Content-Type','application/json','x-central-cron',r.cron_secret),
    body := jsonb_build_object('action','tick','account_id',r.account_id,'bot_id',b.id),
    timeout_milliseconds := 120000
  ) from public.agent_runtime_settings r
    join public.agent_bots b on b.account_id = r.account_id and b.kind = 'gestor'
    where r.enabled and b.active;
$job$);

-- 6. Função para configurar ou ajustar o horário do resumo do Gestor quando desejado
create or replace function public.agent_configure_gestor_schedule(p_cron text)
returns boolean language plpgsql security definer as $$
begin
  perform cron.schedule('central-gestor-daily', p_cron, $job$
    select net.http_post(
      url := r.function_url,
      headers := jsonb_build_object('Content-Type','application/json','x-central-cron',r.cron_secret),
      body := jsonb_build_object('action','tick','account_id',r.account_id,'bot_id',b.id),
      timeout_milliseconds := 120000
    ) from public.agent_runtime_settings r
      join public.agent_bots b on b.account_id = r.account_id and b.kind = 'gestor'
      where r.enabled and b.active;
  $job$);
  return true;
end;
$$;

revoke all on function public.agent_configure_gestor_schedule(text) from public, anon, authenticated;
grant execute on function public.agent_configure_gestor_schedule(text) to service_role;

