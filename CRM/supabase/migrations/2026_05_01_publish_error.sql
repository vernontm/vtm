-- Capture publish failures so the cron error message is visible in the DB
-- (and a future Scheduler UI can show "Why did this fail?" inline).
ALTER TABLE crm_content_scripts
  ADD COLUMN IF NOT EXISTS publish_error text;
