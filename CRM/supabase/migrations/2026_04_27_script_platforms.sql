-- Per-script platform selection.
-- Until now, platforms were a client-level default (uploadpost_platforms).
-- This column lets each script remember which platforms were chosen at
-- publish time, so the queued/scheduled UI can show the per-post selection
-- and let the user re-edit it without losing what was originally chosen.
ALTER TABLE crm_content_scripts
  ADD COLUMN IF NOT EXISTS platforms text[];
