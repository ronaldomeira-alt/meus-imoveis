begin;

alter table public.agent_bots drop constraint agent_bots_kind_check;
alter table public.agent_bots add constraint agent_bots_kind_check check (kind in ('gestor','captador','sentinela','custom','marketing'));
alter table public.agent_bots drop constraint agent_bots_avatar_check;
alter table public.agent_bots add constraint agent_bots_avatar_check check (avatar in ('gestor','captador','sentinela','jade','coral','silver','marketing'));

create table public.agent_marketing_settings (
  account_id uuid primary key references public.accounts(id),
  bot_id uuid not null,
  enabled boolean not null default false,
  paused boolean not null default false,
  config jsonb not null default '{}',
  profile jsonb not null default '{}',
  next_research_at timestamptz not null default now(),
  next_analysis_at timestamptz not null default now(),
  next_delivery_at timestamptz not null default now(),
  last_cycle_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now(),
  foreign key (account_id,bot_id) references public.agent_bots(account_id,id)
);
create table public.agent_marketing_sources (
  id uuid primary key default gen_random_uuid(), account_id uuid not null references public.accounts(id),
  url text not null, identity text not null, kind text not null default 'article',
  region text, topics text[] not null default '{}', trust text not null default 'unreviewed',
  access_status text not null default 'unknown', last_checked_at timestamptz, limits text,
  unique(account_id,url), unique(account_id,id)
);
-- Typed durable memory. References and excerpts, never full third-party archives.
create table public.agent_marketing_memory (
  id uuid primary key default gen_random_uuid(), account_id uuid not null references public.accounts(id),
  kind text not null check (kind in ('fact','content','research','investigation','preference','relation')),
  fingerprint text not null, topic text not null default '', source_id uuid,
  nature text not null default 'observed' check (nature in ('observed','interpretation','hypothesis','inference','user_opinion')),
  state text not null default 'active', data jsonb not null default '{}',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  expires_at timestamptz, unique(account_id,fingerprint), unique(account_id,id),
  foreign key(account_id,source_id) references public.agent_marketing_sources(account_id,id)
);
create index agent_marketing_memory_lookup on public.agent_marketing_memory(account_id,kind,state,updated_at desc);
create index agent_marketing_memory_text on public.agent_marketing_memory using gin(to_tsvector('portuguese',topic || ' ' || data::text));
create table public.agent_marketing_ideas (
  id uuid primary key default gen_random_uuid(), account_id uuid not null references public.accounts(id),
  topic text not null, angle text not null, fingerprint text not null,
  topic_key text not null default '', angle_key text not null default '',
  status text not null default 'proposed' check (status in ('investigating','proposed','saved','approved','discarded','published')),
  proposal jsonb not null, revisions jsonb not null default '[]',
  property_id text, draft_id uuid, delivered_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(account_id,fingerprint), unique(account_id,id)
);
create index agent_marketing_ideas_history on public.agent_marketing_ideas(account_id,status,created_at desc);
create index agent_marketing_ideas_novelty on public.agent_marketing_ideas(account_id,topic_key,angle_key,created_at desc);
create table public.agent_marketing_feedback (
  id uuid primary key default gen_random_uuid(), account_id uuid not null, idea_id uuid,
  request_id uuid not null, text text not null, decision jsonb not null,
  created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
  unique(account_id,request_id), foreign key(account_id,idea_id) references public.agent_marketing_ideas(account_id,id)
);
create table public.agent_marketing_tasks (
  id uuid primary key default gen_random_uuid(), account_id uuid not null, bot_id uuid not null,
  status text not null default 'pending' check (status in ('pending','running','completed','failed')),
  phase text not null default 'context', checkpoint jsonb not null default '{}',
  steps integer not null default 0, calls integer not null default 0,
  reserved_usd numeric not null default 0, measured_usd numeric not null default 0,
  usage jsonb not null default '[]', attempts integer not null default 0,
  lease_token uuid, lease_until timestamptz, ready_at timestamptz not null default now(),
  created_at timestamptz not null default now(), finished_at timestamptz, error text,
  unique(account_id,id), foreign key(account_id,bot_id) references public.agent_bots(account_id,id)
);
create unique index agent_marketing_one_cycle on public.agent_marketing_tasks(account_id) where status in ('pending','running');
create index agent_marketing_tasks_due on public.agent_marketing_tasks(account_id,ready_at) where status in ('pending','running');
create table public.agent_marketing_usage (
  account_id uuid not null references public.accounts(id), day date not null,
  reserved_usd numeric not null default 0, calls integer not null default 0,
  primary key(account_id,day)
);
create table public.agent_marketing_notifications (
  id uuid primary key default gen_random_uuid(), account_id uuid not null, idea_id uuid not null,
  status text not null default 'claimed' check (status in ('claimed','sent','failed','unknown')),
  created_at timestamptz not null default now(), result jsonb,
  unique(account_id,idea_id), foreign key(account_id,idea_id) references public.agent_marketing_ideas(account_id,id)
);

do $$ declare t text; begin
  foreach t in array array['agent_marketing_settings','agent_marketing_sources','agent_marketing_memory','agent_marketing_ideas','agent_marketing_feedback','agent_marketing_tasks','agent_marketing_usage','agent_marketing_notifications'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('grant all on public.%I to service_role',t);
    execute format('create policy account_read on public.%I for select to authenticated using (account_id = public.current_inventory_account_id())',t);
  end loop;
end $$;

-- One bounded phase per invocation; lease tokens fence stale workers.
create function public.agent_marketing_claim(p_account_id uuid,p_bot_id uuid)
returns setof public.agent_marketing_tasks language plpgsql security invoker set search_path=public,pg_temp as $$
declare cfg public.agent_marketing_settings; task public.agent_marketing_tasks;
begin
  select s.* into cfg from public.agent_marketing_settings s
    join public.agent_bots b on b.account_id=s.account_id and b.id=s.bot_id
    join public.agent_runtime_settings r on r.account_id=s.account_id
    where s.account_id=p_account_id and s.bot_id=p_bot_id and s.enabled and not s.paused and b.active and r.enabled
    for update of s skip locked;
  if not found then return; end if;
  update public.agent_marketing_tasks set status='failed',finished_at=now(),error='Limite de retomadas ou passos excedido.'
    where account_id=p_account_id and status in ('pending','running')
    and (lease_until is null or lease_until<now())
    and (attempts>=3 or steps>=coalesce((cfg.config->>'max_steps')::int,16));
  if cfg.next_research_at<=now() and not exists(select 1 from public.agent_marketing_tasks where account_id=p_account_id and status in ('pending','running')) then
    insert into public.agent_marketing_tasks(account_id,bot_id) values(p_account_id,p_bot_id);
    update public.agent_marketing_settings set next_research_at=now()+make_interval(mins=>coalesce((cfg.config->>'research_minutes')::int,720)) where account_id=p_account_id;
  end if;
  select * into task from public.agent_marketing_tasks where account_id=p_account_id and bot_id=p_bot_id
    and status in ('pending','running') and ready_at<=now() and (lease_until is null or lease_until<now())
    order by created_at limit 1 for update skip locked;
  if not found then return; end if;
  return query update public.agent_marketing_tasks set status='running',lease_token=gen_random_uuid(),lease_until=now()+interval '90 seconds',steps=steps+1
    where account_id=p_account_id and id=task.id returning *;
end $$;

create function public.agent_marketing_checkpoint(p_account_id uuid,p_task_id uuid,p_lease uuid,p_phase text,p_checkpoint jsonb,p_done boolean default false,p_error text default null)
returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
declare changed int; begin
  update public.agent_marketing_tasks set checkpoint=p_checkpoint,phase=p_phase,usage=coalesce(p_checkpoint->'usage','[]'),
    measured_usd=coalesce((select sum((u->>'measured_usd')::numeric) from jsonb_array_elements(coalesce(p_checkpoint->'usage','[]')) u),0),
    status=case when p_done then 'completed' when p_error is not null and attempts>=2 then 'failed' else 'pending' end,
    attempts=case when p_error is not null then attempts+1 else 0 end,error=p_error,
    lease_until=null,lease_token=null,ready_at=now()+case when p_error is not null then make_interval(mins=>power(2,attempts)::int) else interval '0' end,
    finished_at=case when p_done or (p_error is not null and attempts>=2) then now() else null end
    where account_id=p_account_id and id=p_task_id and lease_token=p_lease and lease_until>now();
  get diagnostics changed=row_count;
  if changed>0 then update public.agent_marketing_settings set last_cycle_at=case when p_done then now() else last_cycle_at end,last_error=p_error where account_id=p_account_id; end if;
  return changed>0;
end $$;

create function public.agent_marketing_reserve(p_account_id uuid,p_task_id uuid,p_lease uuid,p_cost numeric)
returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
declare cfg public.agent_marketing_settings; task public.agent_marketing_tasks; spent numeric; d date=(now() at time zone 'America/Sao_Paulo')::date;
begin
  select * into cfg from public.agent_marketing_settings where account_id=p_account_id and enabled and not paused for update;
  if not found or p_cost<0 or p_cost is null then return false; end if;
  select * into task from public.agent_marketing_tasks where account_id=p_account_id and id=p_task_id and lease_token=p_lease and lease_until>now() for update;
  if not found or task.calls>=coalesce((cfg.config->>'max_calls')::int,6) or task.reserved_usd+p_cost>coalesce((cfg.config->>'cycle_budget_usd')::numeric,0.1) then return false; end if;
  insert into public.agent_marketing_usage(account_id,day) values(p_account_id,d) on conflict do nothing;
  select reserved_usd into spent from public.agent_marketing_usage where account_id=p_account_id and day=d for update;
  if spent+p_cost>coalesce((cfg.config->>'daily_budget_usd')::numeric,0.5) then return false; end if;
  update public.agent_marketing_usage set reserved_usd=reserved_usd+p_cost,calls=calls+1 where account_id=p_account_id and day=d;
  update public.agent_marketing_tasks set reserved_usd=reserved_usd+p_cost,calls=calls+1 where account_id=p_account_id and id=p_task_id;
  return true;
end $$;

create function public.agent_marketing_deliver(p_account_id uuid,p_bot_id uuid,p_idea_id uuid)
returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
declare cfg public.agent_marketing_settings; idea public.agent_marketing_ideas; conv uuid;
begin
  select * into cfg from public.agent_marketing_settings where account_id=p_account_id and bot_id=p_bot_id and enabled and not paused for update;
  if not found then return false; end if;
  select * into idea from public.agent_marketing_ideas where account_id=p_account_id and id=p_idea_id and status='proposed' and delivered_at is null for update;
  if not found then return false; end if;
  if jsonb_array_length(coalesce(idea.proposal->'evidence_ids','[]'))=0 or exists(
    select 1 from jsonb_array_elements_text(idea.proposal->'evidence_ids') e
    left join public.agent_marketing_memory m on m.account_id=p_account_id and m.id::text=e.value
    where m.id is null or m.state<>'active' or coalesce((m.data->>'contradicted')::boolean,false)
  ) then return false; end if;
  insert into public.agent_conversations(account_id,bot_id) values(p_account_id,p_bot_id) on conflict do nothing;
  select id into conv from public.agent_conversations where account_id=p_account_id and bot_id=p_bot_id;
  insert into public.agent_messages(account_id,conversation_id,client_message_id,role,content,sources)
    values(p_account_id,conv,idea.id,'assistant',idea.proposal->>'message',jsonb_build_array(jsonb_build_object('tool','marketingEvidence','observed_at',now(),'data',idea.proposal))) on conflict do nothing;
  update public.agent_marketing_ideas set delivered_at=now() where account_id=p_account_id and id=p_idea_id;
  return true;
end $$;

-- Human chat shares the same daily ceiling as autonomous research. Interactive
-- calls cannot be used to bypass the Marketing spending cap.
create function public.agent_marketing_reserve_chat(p_account_id uuid,p_run_id uuid,p_cost numeric)
returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
declare cfg public.agent_marketing_settings; run public.agent_runs; spent numeric;
  d date=(now() at time zone 'America/Sao_Paulo')::date; call_count int; reserved_amount numeric;
begin
  select * into cfg from public.agent_marketing_settings where account_id=p_account_id for update;
  if not found or p_cost is null or p_cost<0 then return false; end if;
  select r.* into run from public.agent_runs r join public.agent_bots b on b.account_id=r.account_id and b.id=r.bot_id
    where r.account_id=p_account_id and r.id=p_run_id and r.status='running' and b.kind='marketing' for update of r;
  if not found then return false; end if;
  call_count=coalesce((run.result->>'marketing_calls')::int,0); reserved_amount=coalesce((run.result->>'marketing_reserved_usd')::numeric,0);
  if call_count>=coalesce((cfg.config->>'max_calls')::int,6) or reserved_amount+p_cost>coalesce((cfg.config->>'cycle_budget_usd')::numeric,0.1) then return false; end if;
  insert into public.agent_marketing_usage(account_id,day) values(p_account_id,d) on conflict do nothing;
  select reserved_usd into spent from public.agent_marketing_usage where account_id=p_account_id and day=d for update;
  if spent+p_cost>coalesce((cfg.config->>'daily_budget_usd')::numeric,0.5) then return false; end if;
  update public.agent_marketing_usage set reserved_usd=reserved_usd+p_cost,calls=calls+1 where account_id=p_account_id and day=d;
  update public.agent_runs set result=result||jsonb_build_object('marketing_calls',call_count+1,'marketing_reserved_usd',reserved_amount+p_cost) where account_id=p_account_id and id=p_run_id;
  return true;
end $$;

-- Atomic novelty gate across workers and retries, independent of partial lists.
create function public.agent_marketing_propose(p_account_id uuid,p_task_id uuid,p_lease uuid,p_topic text,p_angle text,p_topic_key text,p_angle_key text,p_fingerprint text,p_proposal jsonb,p_property_id text)
returns uuid language plpgsql security invoker set search_path=public,pg_temp as $$
declare cfg public.agent_marketing_settings; existing uuid; result uuid;
begin
  select * into cfg from public.agent_marketing_settings where account_id=p_account_id and enabled and not paused for update;
  if not found then return null; end if;
  perform 1 from public.agent_marketing_tasks where account_id=p_account_id and id=p_task_id and lease_token=p_lease and lease_until>now();
  if not found then return null; end if;
  select id into existing from public.agent_marketing_ideas where account_id=p_account_id and fingerprint=p_fingerprint;
  if found then return existing; end if;
  if exists(select 1 from public.agent_marketing_ideas where account_id=p_account_id
    and created_at>=now()-make_interval(days=>coalesce((cfg.config->>'similar_days')::int,30))
    and (topic_key=p_topic_key or angle_key=p_angle_key)) then return null; end if;
  insert into public.agent_marketing_ideas(account_id,topic,angle,topic_key,angle_key,fingerprint,proposal,property_id)
    values(p_account_id,p_topic,p_angle,p_topic_key,p_angle_key,p_fingerprint,p_proposal,p_property_id) returning id into result;
  return result;
end $$;

-- At-most-once dispatch. If a process dies after claiming, leave unknown rather
-- than resend a potentially delivered push. The idea remains in chat and queue.
create function public.agent_marketing_claim_push(p_account_id uuid,p_idea_id uuid)
returns setof public.agent_marketing_notifications language plpgsql security invoker set search_path=public,pg_temp as $$
declare cfg public.agent_marketing_settings; t time=(now() at time zone 'America/Sao_Paulo')::time; q1 time; q2 time; n int;
begin
  select s.* into cfg from public.agent_marketing_settings s join public.agent_bots b on b.account_id=s.account_id and b.id=s.bot_id
    where s.account_id=p_account_id and s.enabled and not s.paused and b.active and b.notifications for update of s;
  if not found then return; end if;
  q1=coalesce(cfg.config->>'quiet_start','20:00')::time; q2=coalesce(cfg.config->>'quiet_end','08:00')::time;
  if q1<>q2 and ((q1<q2 and t>=q1 and t<q2) or (q1>q2 and (t>=q1 or t<q2))) then return; end if;
  select count(*) into n from public.agent_marketing_notifications where account_id=p_account_id
    and (created_at at time zone 'America/Sao_Paulo')::date=(now() at time zone 'America/Sao_Paulo')::date;
  if n>=coalesce((cfg.config->>'push_daily_limit')::int,1) or exists(select 1 from public.agent_marketing_notifications where account_id=p_account_id and created_at>now()-make_interval(mins=>coalesce((cfg.config->>'push_interval_minutes')::int,360))) then return; end if;
  return query insert into public.agent_marketing_notifications(account_id,idea_id)
    select p_account_id,p_idea_id where exists(select 1 from public.agent_marketing_ideas where account_id=p_account_id and id=p_idea_id and delivered_at is not null and status='proposed')
    on conflict do nothing returning *;
end $$;

create function public.agent_marketing_feedback_apply(p_account_id uuid,p_idea_id uuid,p_request_id uuid,p_user_id uuid,p_text text,p_decision jsonb)
returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
declare idea public.agent_marketing_ideas; changed int; begin
  perform 1 from public.agent_marketing_settings where account_id=p_account_id for update;
  select * into idea from public.agent_marketing_ideas where account_id=p_account_id and id=p_idea_id for update;
  if not found then return false; end if;
  insert into public.agent_marketing_feedback(account_id,idea_id,request_id,text,decision,created_by)
    values(p_account_id,p_idea_id,p_request_id,p_text,p_decision,p_user_id) on conflict do nothing;
  get diagnostics changed=row_count; if changed=0 then return true; end if;
  update public.agent_marketing_ideas set status=coalesce(p_decision->>'status',status),updated_at=now(),
    revisions=revisions||jsonb_build_array(jsonb_build_object('at',now(),'feedback',p_text,'decision',p_decision)) where account_id=p_account_id and id=p_idea_id;
  if p_decision->>'preference'='reject_topic' then
    update public.agent_marketing_settings set profile=jsonb_set(profile,'{rejected_topics}',coalesce(profile->'rejected_topics','[]')||to_jsonb(idea.topic)),updated_at=now() where account_id=p_account_id;
  elsif p_decision ? 'preference' then
    update public.agent_marketing_settings set profile=jsonb_set(profile,'{confirmed,last_feedback}',jsonb_build_object('text',p_text,'at',now(),'idea_id',p_idea_id)),updated_at=now() where account_id=p_account_id;
  end if;
  return true;
end $$;

do $$ declare f text; begin
  foreach f in array array['agent_marketing_claim(uuid,uuid)','agent_marketing_checkpoint(uuid,uuid,uuid,text,jsonb,boolean,text)','agent_marketing_reserve(uuid,uuid,uuid,numeric)','agent_marketing_reserve_chat(uuid,uuid,numeric)','agent_marketing_deliver(uuid,uuid,uuid)','agent_marketing_propose(uuid,uuid,uuid,text,text,text,text,text,jsonb,text)','agent_marketing_claim_push(uuid,uuid)','agent_marketing_feedback_apply(uuid,uuid,uuid,uuid,text,jsonb)'] loop
    execute 'revoke all on function public.'||f||' from public,anon,authenticated';
    execute 'grant execute on function public.'||f||' to service_role';
  end loop;
end $$;

-- Dedicated Marketing wake-up. Existing Central/Captador jobs remain untouched.
select cron.schedule('central-marketing-worker','* * * * *',$job$
  select net.http_post(url:=r.function_url,headers:=jsonb_build_object('Content-Type','application/json','x-central-cron',r.cron_secret),
    body:=jsonb_build_object('action','tick','account_id',s.account_id,'bot_id',s.bot_id),timeout_milliseconds:=80000)
  from public.agent_marketing_settings s join public.agent_runtime_settings r on r.account_id=s.account_id
    join public.agent_bots b on b.account_id=s.account_id and b.id=s.bot_id
  where r.enabled and b.active and s.enabled and not s.paused and
    (s.next_research_at<=now() or s.next_delivery_at<=now() or exists(select 1 from public.agent_marketing_tasks t where t.account_id=s.account_id and t.status in ('pending','running') and t.ready_at<=now() and (t.lease_until is null or t.lease_until<now())));
$job$);
select cron.schedule('central-marketing-retention','27 4 * * *',$job$
  delete from public.agent_marketing_memory where expires_at<=now() and state<>'corrected' and kind in ('content','research');
  update public.agent_marketing_notifications set status='unknown' where status='claimed' and created_at<now()-interval '10 minutes';
$job$);
commit;
