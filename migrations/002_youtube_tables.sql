-- 002_youtube_tables.sql
-- YouTube content pipeline tables for CRM
-- Run after 001_crm_tables.sql

-- Ensure uuid extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. crm_yt_competitor_videos
-- ============================================================
CREATE TABLE IF NOT EXISTS crm_yt_competitor_videos (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id uuid REFERENCES crm_content_clients(id) ON DELETE SET NULL,
  video_url text NOT NULL,
  video_title text DEFAULT '',
  channel_name text DEFAULT '',
  transcript text DEFAULT '',
  transcription_status text DEFAULT 'pending'
    CHECK (transcription_status IN ('pending', 'processing', 'complete', 'failed')),
  analysis jsonb DEFAULT '{}',
  virality_score integer DEFAULT 0,
  tags jsonb DEFAULT '[]',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE crm_yt_competitor_videos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_all_yt_videos"
  ON crm_yt_competitor_videos FOR ALL
  USING (auth.role() = 'authenticated');

-- ============================================================
-- 2. crm_yt_knowledge_base
-- ============================================================
CREATE TABLE IF NOT EXISTS crm_yt_knowledge_base (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id uuid REFERENCES crm_content_clients(id) ON DELETE SET NULL,
  category text DEFAULT ''
    CHECK (category IN ('', 'hooks', 'intros', 'ctas', 'topics', 'structures')),
  pattern_text text DEFAULT '',
  source_video_id uuid REFERENCES crm_yt_competitor_videos(id) ON DELETE SET NULL,
  effectiveness_score integer DEFAULT 0,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE crm_yt_knowledge_base ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_all_yt_knowledge"
  ON crm_yt_knowledge_base FOR ALL
  USING (auth.role() = 'authenticated');

-- ============================================================
-- 3. crm_yt_scripts
-- ============================================================
CREATE TABLE IF NOT EXISTS crm_yt_scripts (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id uuid REFERENCES crm_content_clients(id) ON DELETE SET NULL,
  title text DEFAULT '',
  hook text DEFAULT '',
  intro text DEFAULT '',
  sections jsonb DEFAULT '[]',
  ctas jsonb DEFAULT '[]',
  outro text DEFAULT '',
  full_script text DEFAULT '',
  status text DEFAULT 'draft',
  source_prompt text DEFAULT '',
  competitor_refs jsonb DEFAULT '[]',
  yt_title text DEFAULT '',
  yt_description text DEFAULT '',
  yt_tags jsonb DEFAULT '[]',
  thumbnail_url text DEFAULT '',
  package_status text DEFAULT 'incomplete',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE crm_yt_scripts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_all_yt_scripts"
  ON crm_yt_scripts FOR ALL
  USING (auth.role() = 'authenticated');

-- ============================================================
-- 4. crm_yt_thumbnails
-- ============================================================
CREATE TABLE IF NOT EXISTS crm_yt_thumbnails (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  script_id uuid REFERENCES crm_yt_scripts(id) ON DELETE SET NULL,
  client_id uuid REFERENCES crm_content_clients(id) ON DELETE SET NULL,
  video_title text DEFAULT '',
  inspiration_urls jsonb DEFAULT '[]',
  character_ref_url text DEFAULT '',
  logo_urls jsonb DEFAULT '[]',
  vision_analysis text DEFAULT '',
  generation_prompt text DEFAULT '',
  result_url text DEFAULT '',
  alt_results jsonb DEFAULT '[]',
  status text DEFAULT 'pending',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE crm_yt_thumbnails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_all_yt_thumbnails"
  ON crm_yt_thumbnails FOR ALL
  USING (auth.role() = 'authenticated');

-- ============================================================
-- 5. crm_yt_assets
-- ============================================================
CREATE TABLE IF NOT EXISTS crm_yt_assets (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id uuid REFERENCES crm_content_clients(id) ON DELETE SET NULL,
  asset_type text DEFAULT ''
    CHECK (asset_type IN ('', 'character_ref', 'logo', 'inspiration')),
  label text DEFAULT '',
  storage_url text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE crm_yt_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_all_yt_assets"
  ON crm_yt_assets FOR ALL
  USING (auth.role() = 'authenticated');

-- ============================================================
-- Indexes for common queries
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_yt_videos_client ON crm_yt_competitor_videos(client_id);
CREATE INDEX IF NOT EXISTS idx_yt_videos_status ON crm_yt_competitor_videos(transcription_status);
CREATE INDEX IF NOT EXISTS idx_yt_knowledge_client ON crm_yt_knowledge_base(client_id);
CREATE INDEX IF NOT EXISTS idx_yt_knowledge_category ON crm_yt_knowledge_base(category);
CREATE INDEX IF NOT EXISTS idx_yt_knowledge_source ON crm_yt_knowledge_base(source_video_id);
CREATE INDEX IF NOT EXISTS idx_yt_scripts_client ON crm_yt_scripts(client_id);
CREATE INDEX IF NOT EXISTS idx_yt_scripts_status ON crm_yt_scripts(status);
CREATE INDEX IF NOT EXISTS idx_yt_thumbnails_client ON crm_yt_thumbnails(client_id);
CREATE INDEX IF NOT EXISTS idx_yt_thumbnails_script ON crm_yt_thumbnails(script_id);
CREATE INDEX IF NOT EXISTS idx_yt_assets_client ON crm_yt_assets(client_id);
CREATE INDEX IF NOT EXISTS idx_yt_assets_type ON crm_yt_assets(asset_type);
