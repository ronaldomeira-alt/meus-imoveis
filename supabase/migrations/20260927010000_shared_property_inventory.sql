-- Shared property inventory with durable deletion tombstones for multi-device sync.
create table if not exists public.inventory_properties (
  account_id uuid not null,
  property_id text not null,
  property_data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (account_id, property_id),
  constraint inventory_properties_data_id_matches check (property_data->>'id' = property_id)
);

create table if not exists public.inventory_property_tombstones (
  account_id uuid not null,
  property_id text not null,
  deleted_at timestamptz not null default now(),
  primary key (account_id, property_id)
);

alter table public.inventory_properties enable row level security;
alter table public.inventory_property_tombstones enable row level security;

create or replace function public.current_inventory_account_id()
returns uuid
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select p.account_id
  from public.profiles p
  where p.user_id = auth.uid()
    and p.account_id is not null
  limit 1;
$$;

revoke all on function public.current_inventory_account_id() from public, anon;
grant execute on function public.current_inventory_account_id() to authenticated;

drop policy if exists inventory_properties_select_own_account on public.inventory_properties;
create policy inventory_properties_select_own_account
  on public.inventory_properties for select to authenticated
  using (account_id = public.current_inventory_account_id());

drop policy if exists inventory_tombstones_select_own_account on public.inventory_property_tombstones;
create policy inventory_tombstones_select_own_account
  on public.inventory_property_tombstones for select to authenticated
  using (account_id = public.current_inventory_account_id());

drop policy if exists inventory_properties_insert_own_account on public.inventory_properties;
create policy inventory_properties_insert_own_account
  on public.inventory_properties for insert to authenticated
  with check (account_id = public.current_inventory_account_id());

drop policy if exists inventory_properties_update_own_account on public.inventory_properties;
create policy inventory_properties_update_own_account
  on public.inventory_properties for update to authenticated
  using (account_id = public.current_inventory_account_id())
  with check (account_id = public.current_inventory_account_id());

drop policy if exists inventory_properties_delete_own_account on public.inventory_properties;
create policy inventory_properties_delete_own_account
  on public.inventory_properties for delete to authenticated
  using (account_id = public.current_inventory_account_id());

drop policy if exists inventory_tombstones_insert_own_account on public.inventory_property_tombstones;
create policy inventory_tombstones_insert_own_account
  on public.inventory_property_tombstones for insert to authenticated
  with check (account_id = public.current_inventory_account_id());

revoke all on public.inventory_properties from anon, authenticated;
revoke all on public.inventory_property_tombstones from anon, authenticated;
grant select, insert, update, delete on public.inventory_properties to authenticated;
grant select, insert on public.inventory_property_tombstones to authenticated;

create or replace function public.get_inventory_snapshot()
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  v_account_id uuid := public.current_inventory_account_id();
begin
  if auth.uid() is null or v_account_id is null then
    raise exception 'Conta autenticada não encontrada para sincronizar o estoque.';
  end if;

  return jsonb_build_object(
    'properties', coalesce((
      select jsonb_agg(ip.property_data order by ip.updated_at desc)
      from public.inventory_properties ip
      where ip.account_id = v_account_id
    ), '[]'::jsonb),
    'deletedIds', coalesce((
      select jsonb_agg(t.property_id)
      from public.inventory_property_tombstones t
      where t.account_id = v_account_id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.sync_inventory_properties(p_properties jsonb)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_account_id uuid := public.current_inventory_account_id();
  v_item jsonb;
  v_property_id text;
  v_property_updated_at timestamptz;
begin
  if auth.uid() is null or v_account_id is null then
    raise exception 'Conta autenticada não encontrada para sincronizar o estoque.';
  end if;
  if jsonb_typeof(p_properties) <> 'array' then
    raise exception 'A lista de imóveis precisa ser um array.';
  end if;

  for v_item in select value from jsonb_array_elements(p_properties)
  loop
    v_property_id := v_item->>'id';
    if v_property_id is null or v_property_id = '' then
      continue;
    end if;
    perform pg_advisory_xact_lock(hashtextextended(v_account_id::text || ':' || v_property_id, 0));
    if exists (
      select 1 from public.inventory_property_tombstones t
      where t.account_id = v_account_id and t.property_id = v_property_id
    ) then
      continue;
    end if;

    v_property_updated_at := coalesce(
      nullif(v_item->>'updated_at', '')::timestamptz,
      nullif(v_item->>'created_at', '')::timestamptz,
      now()
    );

    insert into public.inventory_properties (account_id, property_id, property_data, updated_at)
    values (v_account_id, v_property_id, v_item, v_property_updated_at)
    on conflict (account_id, property_id) do update
      set property_data = excluded.property_data,
          updated_at = excluded.updated_at
      where excluded.updated_at > inventory_properties.updated_at;
  end loop;
end;
$$;

create or replace function public.delete_inventory_property(p_property_id text)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_account_id uuid := public.current_inventory_account_id();
begin
  if auth.uid() is null or v_account_id is null then
    raise exception 'Conta autenticada não encontrada para sincronizar o estoque.';
  end if;
  if p_property_id is null or p_property_id = '' then
    raise exception 'O identificador do imóvel é obrigatório.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_account_id::text || ':' || p_property_id, 0));

  insert into public.inventory_property_tombstones (account_id, property_id)
  values (v_account_id, p_property_id)
  on conflict (account_id, property_id) do nothing;

  delete from public.inventory_properties
  where account_id = v_account_id and property_id = p_property_id;
end;
$$;

revoke all on function public.get_inventory_snapshot() from public, anon;
revoke all on function public.sync_inventory_properties(jsonb) from public, anon;
revoke all on function public.delete_inventory_property(text) from public, anon;
grant execute on function public.get_inventory_snapshot() to authenticated;
grant execute on function public.sync_inventory_properties(jsonb) to authenticated;
grant execute on function public.delete_inventory_property(text) to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.inventory_properties;
exception when duplicate_object then null;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.inventory_property_tombstones;
exception when duplicate_object then null;
end;
$$;

create or replace function public.lock_inventory_tombstone()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.account_id::text || ':' || new.property_id, 0));
  return new;
end;
$$;

revoke all on function public.lock_inventory_tombstone() from public, anon;
grant execute on function public.lock_inventory_tombstone() to authenticated;
drop trigger if exists inventory_property_tombstone_lock on public.inventory_property_tombstones;
create trigger inventory_property_tombstone_lock
  before insert on public.inventory_property_tombstones
  for each row execute function public.lock_inventory_tombstone();

create or replace function public.reject_tombstoned_inventory_property()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.account_id::text || ':' || new.property_id, 0));
  if exists (
    select 1 from public.inventory_property_tombstones t
    where t.account_id = new.account_id and t.property_id = new.property_id
  ) then
    raise exception 'Este imóvel foi excluído e não pode ser restaurado pela sincronização.'
      using errcode = '23505';
  end if;
  return new;
end;
$$;

revoke all on function public.reject_tombstoned_inventory_property() from public, anon;
grant execute on function public.reject_tombstoned_inventory_property() to authenticated;
drop trigger if exists inventory_property_reject_tombstoned on public.inventory_properties;
create trigger inventory_property_reject_tombstoned
  before insert or update on public.inventory_properties
  for each row execute function public.reject_tombstoned_inventory_property();
