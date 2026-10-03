begin;

create table public.agent_bots (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id),
  slug text not null,
  name text not null check (length(name) between 2 and 60),
  mission text not null check (length(mission) between 5 and 4000),
  kind text not null check (kind in ('gestor','captador','sentinela','custom')),
  avatar text not null default 'jade' check (avatar in ('gestor','captador','sentinela','jade','coral','silver')),
  provider text not null default 'auto' check (provider in ('auto','groq','openai','gemini')),
  work_mode text not null default 'on_demand' check (work_mode in ('on_demand','scheduled','monitoring')),
  autonomy text not null default 'read_only' check (autonomy in ('read_only','propose','approval','allowed_auto')),
  tools text[] not null default '{}',
  notifications boolean not null default true,
  notification_events text[] not null default array['incident','approval'],
  active boolean not null default true,
  sort_order integer not null default 100,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (account_id, slug),
  unique (account_id, id)
);

create table public.agent_runtime_settings (
  account_id uuid primary key references public.accounts(id),
  enabled boolean not null default true,
  function_url text not null,
  cron_secret text not null default encode(gen_random_bytes(32), 'hex'),
  last_tick_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.agent_conversations (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  bot_id uuid not null,
  created_at timestamptz not null default now(),
  unique (account_id, bot_id),
  unique (account_id, id),
  foreign key (account_id, bot_id) references public.agent_bots(account_id, id) on delete cascade
);

create table public.agent_messages (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  conversation_id uuid not null,
  client_message_id uuid not null,
  role text not null check (role in ('user','assistant')),
  content text not null check (length(content) between 1 and 16000),
  sources jsonb not null default '[]',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days',
  unique (account_id, conversation_id, client_message_id, role),
  foreign key (account_id, conversation_id) references public.agent_conversations(account_id, id) on delete cascade
);

create table public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  bot_id uuid not null,
  trigger_type text not null check (trigger_type in ('chat','schedule','inspection','approval')),
  status text not null default 'running' check (status in ('running','completed','failed')),
  request_id uuid,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  result jsonb not null default '{}',
  error text,
  unique (account_id, id),
  unique (account_id, bot_id, request_id),
  foreign key (account_id, bot_id) references public.agent_bots(account_id, id)
);

create table public.agent_events (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  bot_id uuid not null,
  run_id uuid,
  type text not null,
  tool text,
  duration_ms integer,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now(),
  foreign key (account_id, bot_id) references public.agent_bots(account_id, id),
  foreign key (account_id, run_id) references public.agent_runs(account_id, id)
);

create table public.agent_incidents (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  bot_id uuid not null,
  run_id uuid,
  fingerprint text not null,
  component text not null,
  expected text not null,
  observed text not null,
  impact text not null check (impact in ('low','medium','high')),
  confidence numeric not null check (confidence between 0 and 1),
  status text not null default 'open' check (status in ('open','resolved')),
  dossier jsonb not null default '{}',
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (account_id, id),
  foreign key (account_id, bot_id) references public.agent_bots(account_id, id),
  foreign key (account_id, run_id) references public.agent_runs(account_id, id)
);
create unique index agent_incidents_one_open on public.agent_incidents(account_id, fingerprint) where status = 'open';

create table public.agent_approvals (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  bot_id uuid not null,
  action text not null check (action in ('investigate_incident','run_report')),
  reason text not null,
  context jsonb not null default '{}',
  status text not null default 'pending' check (status in ('pending','approved','denied','executed','failed')),
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  result jsonb,
  created_at timestamptz not null default now(),
  foreign key (account_id, bot_id) references public.agent_bots(account_id, id),
  check ((status = 'pending' and decided_by is null and decided_at is null) or
         (status <> 'pending' and decided_by is not null and decided_at is not null))
);

create table public.agent_schedules (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  bot_id uuid not null,
  interval_minutes integer not null check (interval_minutes between 60 and 10080 and interval_minutes % 60 = 0),
  enabled boolean not null default true,
  next_run_at timestamptz not null default now(),
  last_run_at timestamptz,
  unique (account_id, bot_id),
  foreign key (account_id, bot_id) references public.agent_bots(account_id, id)
);

create index agent_messages_history on public.agent_messages(account_id, conversation_id, created_at desc);
create index agent_messages_retention on public.agent_messages(expires_at);
create index agent_runs_history on public.agent_runs(account_id, bot_id, started_at desc);
create unique index agent_runs_one_running on public.agent_runs(account_id, bot_id) where status = 'running';
create index agent_events_history on public.agent_events(account_id, created_at desc);
create index agent_approvals_pending on public.agent_approvals(account_id, status, created_at desc);
create index agent_schedules_due on public.agent_schedules(next_run_at) where enabled;

-- Only the authenticated backend writes. RLS limits direct reads to the account.
do $$
declare t text;
begin
  foreach t in array array['agent_bots','agent_conversations','agent_messages','agent_runs','agent_events','agent_incidents','agent_approvals','agent_schedules'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('create policy account_read on public.%I for select to authenticated using (account_id = public.current_inventory_account_id()%s)', t,
      case when t = 'agent_messages' then ' and expires_at > now()' else '' end);
  end loop;
end $$;
alter table public.agent_runtime_settings enable row level security;
revoke all on public.agent_runtime_settings from public, anon, authenticated;
grant all on public.agent_runtime_settings to service_role;

create function public.agent_claim_due_schedule(p_account_id uuid, p_bot_id uuid)
returns setof public.agent_schedules language sql security invoker set search_path = public, pg_temp as $$
  update public.agent_schedules s
  -- Align to the cron minute: network jitter must not skip the next hourly tick.
  set last_run_at = now(), next_run_at = date_trunc('hour', now()) + make_interval(mins => s.interval_minutes) + interval '7 minutes'
  where s.id = (
    select x.id from public.agent_schedules x
    join public.agent_bots b on b.account_id = x.account_id and b.id = x.bot_id
    join public.agent_runtime_settings r on r.account_id = x.account_id
    where x.account_id = p_account_id and x.bot_id = p_bot_id and x.enabled and b.active and r.enabled and x.next_run_at <= now()
    order by x.next_run_at limit 1 for update of x skip locked
  ) returning s.*;
$$;
revoke all on function public.agent_claim_due_schedule(uuid,uuid) from public, anon, authenticated;
grant execute on function public.agent_claim_due_schedule(uuid,uuid) to service_role;

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- Dedicated job, token and tables: independent of all existing Captador jobs.
select cron.schedule('central-bots-hourly', '7 * * * *', $job$
  select net.http_post(
    url := r.function_url,
    headers := jsonb_build_object('Content-Type','application/json','x-central-cron',r.cron_secret),
    body := jsonb_build_object('action','tick','account_id',r.account_id,'bot_id',s.bot_id),
    timeout_milliseconds := 120000
  ) from public.agent_runtime_settings r
    join public.agent_schedules s on s.account_id = r.account_id
    join public.agent_bots b on b.account_id = s.account_id and b.id = s.bot_id
    where r.enabled and s.enabled and b.active and s.next_run_at <= now();
$job$);
select cron.schedule('central-bots-chat-retention', '17 4 * * *', $job$
  delete from public.agent_messages where expires_at <= now();
$job$);

commit;
