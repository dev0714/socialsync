# SocialSync — Supabase Schema

SocialSync uses a dedicated `socialsync` schema. Create and expose it, then add the tables.

```sql
create schema if not exists socialsync;
grant usage on schema socialsync to anon, authenticated, service_role;
grant all on all tables in schema socialsync to anon, authenticated, service_role;
grant all on all sequences in schema socialsync to anon, authenticated, service_role;
alter default privileges in schema socialsync grant all on tables to anon, authenticated, service_role;
alter default privileges in schema socialsync grant all on sequences to anon, authenticated, service_role;

-- Connected channels; access_token / refresh_token are AES-256-GCM encrypted by the app.
create table socialsync.social_accounts (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('instagram','facebook','tiktok','youtube','linkedin')),
  display_name text,
  external_id text,
  access_token text, refresh_token text, token_expires_at timestamptz, scopes text,
  connected_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index social_accounts_platform_external_idx on socialsync.social_accounts (platform, external_id);

create table socialsync.social_posts (
  id uuid primary key default gen_random_uuid(),
  prompt text not null, caption text, image_path text, video_path text,
  status text not null default 'draft' check (status in ('draft','publishing','published','failed')),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index social_posts_created_at_idx on socialsync.social_posts (created_at desc);

create table socialsync.social_post_targets (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references socialsync.social_posts(id) on delete cascade,
  platform text not null check (platform in ('instagram','facebook','tiktok','youtube','linkedin')),
  status text not null default 'pending' check (status in ('pending','published','failed','skipped')),
  remote_id text, remote_url text, error text, posted_at timestamptz,
  created_at timestamptz not null default now()
);
create index social_post_targets_post_idx on socialsync.social_post_targets (post_id);

-- Recommended: enable RLS with no policies (the app uses the service-role key, which bypasses RLS).
alter table socialsync.social_accounts enable row level security;
alter table socialsync.social_posts enable row level security;
alter table socialsync.social_post_targets enable row level security;
```

Then add `socialsync` to the project's exposed schemas (Dashboard → API settings), and create a
**public storage bucket** named `socialsync` (or set `SUPABASE_STORAGE_BUCKET`) — generated
images are stored under the `social/` prefix and must be publicly readable so Instagram/TikTok
can fetch them by URL.

> If you already created this schema in a shared project, RLS + tables may exist — skip what's present.
