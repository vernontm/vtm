-- CRM Avatars schema
-- Run this in the Supabase SQL editor for project etcobsnhkbmbxsnwknzn
-- Then create a PUBLIC storage bucket named `avatar-media` in the Storage tab.

-- Avatars: one row per AI character (e.g. Kara)
create table if not exists public.crm_avatars (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  heygen_group_id text,
  elevenlabs_voice_id text,
  logo_url text,
  logo_position text default 'tr' check (logo_position in ('tl','tr','bl','br')),
  logo_size_pct numeric default 12,
  caption_style jsonb default '{"font":"Montserrat","size":64,"color":"#FFFFFF","highlight":"#ff9b26","y_position":0.75,"words_per_chunk":2,"stroke":"#000000","stroke_width":6}'::jsonb,
  default_music_url text,
  default_volume numeric default 0.15 check (default_volume >= 0 and default_volume <= 1),
  default_fade_secs numeric default 1.5,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Outfits: buckets that group looks within an avatar (CRM-side only; HeyGen has no outfit concept)
create table if not exists public.crm_avatar_outfits (
  id uuid primary key default gen_random_uuid(),
  avatar_id uuid not null references public.crm_avatars(id) on delete cascade,
  name text not null,
  sort_order int default 0,
  created_at timestamptz default now()
);
create index if not exists crm_avatar_outfits_avatar_id_idx on public.crm_avatar_outfits(avatar_id);

-- Looks: one row per (outfit, angle) — mirrors a HeyGen "look" within the avatar group.
-- outfit_id is nullable: newly imported looks start unassigned until the user buckets them.
create table if not exists public.crm_avatar_looks (
  id uuid primary key default gen_random_uuid(),
  avatar_id uuid not null references public.crm_avatars(id) on delete cascade,
  outfit_id uuid references public.crm_avatar_outfits(id) on delete set null,
  heygen_look_id text,
  image_url text not null,
  angle_order int default 0,
  created_at timestamptz default now()
);
create index if not exists crm_avatar_looks_avatar_id_idx on public.crm_avatar_looks(avatar_id);
create index if not exists crm_avatar_looks_outfit_id_idx on public.crm_avatar_looks(outfit_id);
create unique index if not exists crm_avatar_looks_heygen_unique
  on public.crm_avatar_looks(avatar_id, heygen_look_id) where heygen_look_id is not null;

-- Renders: one row per composed video job.
-- sentences jsonb: [{ text, look_id, audio_url, audio_duration, heygen_video_id, clip_url, status }]
create table if not exists public.crm_avatar_renders (
  id uuid primary key default gen_random_uuid(),
  avatar_id uuid not null references public.crm_avatars(id) on delete cascade,
  outfit_id uuid references public.crm_avatar_outfits(id) on delete set null,
  client_id uuid,
  title text,
  script text not null,
  sentences jsonb not null default '[]'::jsonb,
  music_url text,
  music_volume numeric,
  music_fade_secs numeric,
  caption_style jsonb,
  logo_url text,
  logo_position text,
  final_video_url text,
  duration_secs numeric,
  status text not null default 'draft' check (status in (
    'draft','pending','generating_audio','generating_clips','stitching','done','failed'
  )),
  error text,
  scheduled_post_id uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists crm_avatar_renders_status_idx on public.crm_avatar_renders(status);
create index if not exists crm_avatar_renders_avatar_id_idx on public.crm_avatar_renders(avatar_id);

-- updated_at trigger
create or replace function public.crm_avatars_touch_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

drop trigger if exists trg_crm_avatars_touch on public.crm_avatars;
create trigger trg_crm_avatars_touch before update on public.crm_avatars
  for each row execute function public.crm_avatars_touch_updated_at();

drop trigger if exists trg_crm_avatar_renders_touch on public.crm_avatar_renders;
create trigger trg_crm_avatar_renders_touch before update on public.crm_avatar_renders
  for each row execute function public.crm_avatars_touch_updated_at();
