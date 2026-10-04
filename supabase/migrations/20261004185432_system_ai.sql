begin;
create table public.system_ai_settings (
  account_id uuid primary key references public.accounts(id),
  provider text not null check(provider in ('groq','openai','gemini')),
  model text not null check(model ~ '^[a-zA-Z0-9._/-]{1,100}$'),
  transcription_model text not null check(transcription_model ~ '^[a-zA-Z0-9._/-]{1,100}$'),
  encrypted_key jsonb,
  enabled boolean not null default true,
  updated_by uuid references auth.users(id), updated_at timestamptz not null default now()
);
create table public.system_ai_usage (
  account_id uuid not null references public.accounts(id), hour timestamptz not null,
  calls integer not null default 0 check(calls between 0 and 120),
  request_ids uuid[] not null default '{}', primary key(account_id,hour)
);
alter table public.system_ai_settings enable row level security;
alter table public.system_ai_usage enable row level security;
revoke all on public.system_ai_settings,public.system_ai_usage from public,anon,authenticated;
grant all on public.system_ai_settings,public.system_ai_usage to service_role;
create function public.system_ai_reserve(p_account_id uuid,p_request_id uuid)
returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
declare accepted int; begin
  insert into public.system_ai_usage(account_id,hour,calls,request_ids)
    values(p_account_id,date_trunc('hour',now()),1,array[p_request_id])
  on conflict(account_id,hour) do update set calls=system_ai_usage.calls+1,
    request_ids=array_append(system_ai_usage.request_ids,p_request_id)
    where system_ai_usage.calls<120 and not(p_request_id=any(system_ai_usage.request_ids));
  get diagnostics accepted=row_count;
  return accepted=1;
end $$;
revoke all on function public.system_ai_reserve(uuid,uuid) from public,anon,authenticated;
grant execute on function public.system_ai_reserve(uuid,uuid) to service_role;
-- A dedicated retention job never changes Central, Captador or publishing jobs.
select cron.schedule('system-ai-usage-retention','41 4 * * *',$job$
  delete from public.system_ai_usage where hour<now()-interval '30 days';
$job$);
commit;
