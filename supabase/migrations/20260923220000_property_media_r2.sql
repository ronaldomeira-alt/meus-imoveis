-- Tabela de metadados de mídias de imóveis (Cloudflare R2 e Supabase Storage)
create table if not exists public.property_media (
  id uuid primary key default gen_random_uuid(),
  property_id text not null,
  object_key text not null,
  storage_provider text not null default 'r2',
  media_type text not null default 'photo',
  mime_type text not null,
  size_bytes bigint not null default 0,
  sort_order integer not null default 0,
  is_cover boolean not null default false,
  storage_path text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_property_media_property_id on public.property_media (property_id, sort_order asc);
create index if not exists idx_property_media_cover on public.property_media (property_id, is_cover);
create index if not exists idx_property_media_object_key on public.property_media (object_key);

alter table public.property_media enable row level security;

-- Leitura pública para exibição de mídias do catálogo
create policy "Allow read property_media"
  on public.property_media
  for select
  using (true);

-- Operações completas para service_role
create policy "Allow all for service_role"
  on public.property_media
  for all
  to service_role
  using (true)
  with check (true);

-- Operações de inserção e atualização autenticadas
create policy "Allow write property_media"
  on public.property_media
  for all
  to anon, authenticated
  using (true)
  with check (true);
