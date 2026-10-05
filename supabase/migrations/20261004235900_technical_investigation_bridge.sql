create table public.agent_technical_runners (
 id uuid primary key default gen_random_uuid(),
 account_id uuid not null references public.accounts(id),
 label text not null default 'Antigravity neste computador',
 token_hash text not null unique check(length(token_hash)=64),
 enabled boolean not null default true,
 last_seen_at timestamptz,
 state text not null default 'starting' check(state in ('starting','ready','busy','needs_access','error')),
 created_at timestamptz not null default now(),
 unique(account_id,id)
);
create table public.agent_technical_jobs (
 id uuid primary key default gen_random_uuid(),
 account_id uuid not null references public.accounts(id),
 incident_id uuid not null,
 requested_by uuid not null references auth.users(id),
 request_id uuid not null,
 status text not null default 'queued' check(status in ('queued','running','completed','needs_access','failed','cancelled')),
 context jsonb not null,
 result jsonb,
 progress text not null default 'Aguardando o Antigravity conectado.',
 runner_id uuid,
 lease_token uuid,
 lease_until timestamptz,
 created_at timestamptz not null default now(),
 started_at timestamptz,
 finished_at timestamptz,
 foreign key(account_id,incident_id) references public.agent_incidents(account_id,id),
 foreign key(account_id,runner_id) references public.agent_technical_runners(account_id,id),
 unique(account_id,request_id)
);
create unique index agent_technical_one_active on public.agent_technical_jobs(account_id,incident_id) where status in ('queued','running');
create index agent_technical_queue on public.agent_technical_jobs(account_id,created_at) where status='queued';
alter table public.agent_technical_jobs enable row level security;
alter table public.agent_technical_runners enable row level security;
create policy technical_jobs_read on public.agent_technical_jobs for select to authenticated using(account_id=(select public.current_inventory_account_id()));
create policy technical_runner_read on public.agent_technical_runners for select to authenticated using(account_id=(select public.current_inventory_account_id()));
revoke all on public.agent_technical_jobs,public.agent_technical_runners from anon,authenticated;
grant select(id,account_id,incident_id,request_id,status,result,progress,created_at,started_at,finished_at) on public.agent_technical_jobs to authenticated;
grant select(id,account_id,label,enabled,last_seen_at,state,created_at) on public.agent_technical_runners to authenticated;
grant all on public.agent_technical_jobs,public.agent_technical_runners to service_role;

create function public.agent_technical_enqueue(p_account_id uuid,p_user_id uuid,p_incident_id uuid,p_request_id uuid,p_context jsonb)
returns setof public.agent_technical_jobs language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(p_account_id::text,887));
 if not exists(select 1 from agent_runtime_settings where account_id=p_account_id and enabled) then raise exception 'Central disabled'; end if;
 if exists(select 1 from agent_technical_jobs where account_id=p_account_id and request_id=p_request_id) then
  return query select * from agent_technical_jobs where account_id=p_account_id and request_id=p_request_id; return;
 end if;
 if exists(select 1 from agent_technical_jobs where account_id=p_account_id and incident_id=p_incident_id and status in ('queued','running')) then
  return query select * from agent_technical_jobs where account_id=p_account_id and incident_id=p_incident_id and status in ('queued','running'); return;
 end if;
 if (select count(*) from agent_technical_jobs where account_id=p_account_id and created_at>now()-interval '24 hours')>=10 then raise exception 'Daily investigation limit'; end if;
 return query insert into agent_technical_jobs(account_id,requested_by,incident_id,request_id,context) values(p_account_id,p_user_id,p_incident_id,p_request_id,p_context) returning *;
end $$;
create function public.agent_technical_claim(p_account_id uuid,p_runner_id uuid)
returns setof public.agent_technical_jobs language plpgsql security invoker set search_path=public,pg_temp as $$
declare chosen uuid;
begin
 if not exists(select 1 from agent_runtime_settings where account_id=p_account_id and enabled) or not exists(select 1 from agent_technical_runners where id=p_runner_id and account_id=p_account_id and enabled) then return; end if;
 update agent_technical_jobs set status='failed',progress='A investigação foi interrompida. Você pode solicitar uma nova tentativa.',finished_at=now(),lease_token=null where account_id=p_account_id and status='running' and lease_until<now();
 -- One concurrent task per runner, including competing claims from restarts.
 perform pg_advisory_xact_lock(hashtextextended(p_runner_id::text,888));
 if exists(select 1 from agent_technical_jobs where account_id=p_account_id and runner_id=p_runner_id and status='running') then return; end if;
 select id into chosen from agent_technical_jobs where account_id=p_account_id and status='queued' order by created_at for update skip locked limit 1;
 if chosen is null then return; end if;
 return query update agent_technical_jobs set status='running',runner_id=p_runner_id,lease_token=gen_random_uuid(),lease_until=now()+interval '15 minutes',started_at=now(),progress='Antigravity investigando o código e as evidências disponíveis.' where id=chosen returning *;
end $$;
revoke all on function public.agent_technical_enqueue(uuid,uuid,uuid,uuid,jsonb),public.agent_technical_claim(uuid,uuid) from public,anon,authenticated;
grant execute on function public.agent_technical_enqueue(uuid,uuid,uuid,uuid,jsonb),public.agent_technical_claim(uuid,uuid) to service_role;
