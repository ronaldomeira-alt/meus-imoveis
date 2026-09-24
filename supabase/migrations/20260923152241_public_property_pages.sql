-- Public pages use a sanitized snapshot because the inventory itself is kept
-- in browser local storage. Only the Vercel server function can read/write it.
create table if not exists public.public_property_pages (
  id uuid primary key,
  property_id text not null unique,
  is_active boolean not null default false,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.public_property_pages enable row level security;
revoke all on table public.public_property_pages from public, anon, authenticated;
grant all on table public.public_property_pages to service_role;

create index if not exists public_property_pages_active_updated_idx
  on public.public_property_pages (is_active, updated_at desc);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'public-property-media',
  'public-property-media',
  true,
  8388608,
  array['image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Public bucket URLs permit reads. No browser upload policy is created; uploads
-- are performed by the server with the service role key.
