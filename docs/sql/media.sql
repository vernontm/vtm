-- Photos and videos on iMessage conversations. Run once in the Supabase SQL
-- editor. Files themselves live in the public storage bucket "crm-media",
-- which the API creates on first use (or create it under Storage > New
-- bucket, public, if you prefer to do it by hand).

alter table crm_sms_messages add column if not exists attachments jsonb;
-- attachments: [{ url, type ('image' | 'video' | 'audio' | 'file'), name, mime, size, width, height }]
