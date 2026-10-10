-- Tabela de auditoria para chamadas de escrita do servidor MCP
create table if not exists public.mcp_audit_logs (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  tool_name text not null,
  affected_ids text[] default '{}',
  payload jsonb default '{}'::jsonb,
  result jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_mcp_audit_logs_account on public.mcp_audit_logs (account_id, created_at desc);
create index if not exists idx_mcp_audit_logs_tool on public.mcp_audit_logs (tool_name, created_at desc);

alter table public.mcp_audit_logs enable row level security;

-- Política de acesso para service_role
drop policy if exists "Allow all mcp_audit_logs for service_role" on public.mcp_audit_logs;
create policy "Allow all mcp_audit_logs for service_role"
  on public.mcp_audit_logs
  for all
  to service_role
  using (true)
  with check (true);
