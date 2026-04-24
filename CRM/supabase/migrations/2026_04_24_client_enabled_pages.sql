-- Per-client page whitelist. When set, only these pages appear in the
-- sidebar for THAT client (admins + users alike). Null/empty = all pages
-- available (legacy behaviour). Lets Ray configure, per client, which
-- CRM modules they actually use so the sidebar reflects their reality
-- when he switches between them.
ALTER TABLE crm_content_clients
  ADD COLUMN IF NOT EXISTS enabled_pages TEXT[] NULL;

COMMENT ON COLUMN crm_content_clients.enabled_pages IS
  'Optional whitelist of page slugs this client uses. Null = all pages.';
