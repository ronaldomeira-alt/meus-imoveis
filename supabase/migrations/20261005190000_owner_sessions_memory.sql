begin;
alter table public.agent_messages add column if not exists session_id uuid;
create index if not exists agent_messages_session on public.agent_messages(account_id,conversation_id,session_id,created_at);
create table if not exists public.agent_chat_memories (
 id uuid primary key default gen_random_uuid(), account_id uuid not null references public.accounts(id) on delete cascade,
 bot_id uuid not null, request_id uuid not null, requested_by uuid references auth.users(id) on delete set null,
 request_summary text not null check(length(request_summary)<=500), summary text not null check(length(summary)<=1500),
 outcome text not null check(outcome in ('context','verified','failed')), evidence jsonb not null default '[]',
 extra_round boolean not null default false, created_at timestamptz not null default now(),
 foreign key(account_id,bot_id) references public.agent_bots(account_id,id) on delete cascade,
 unique(account_id,bot_id,request_id));
create index if not exists agent_chat_memories_recent on public.agent_chat_memories(account_id,bot_id,created_at desc);
alter table public.agent_chat_memories enable row level security;
revoke all on public.agent_chat_memories from public,anon,authenticated;
grant select on public.agent_chat_memories to authenticated;
grant all on public.agent_chat_memories to service_role;
create policy agent_chat_memories_tenant on public.agent_chat_memories for select to authenticated using(account_id=public.current_inventory_account_id());
commit;
