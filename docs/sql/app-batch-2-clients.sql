-- App batch 2, clients stream: file previews, adding a file from the phone,
-- and uploading a signed agreement (docs/engineer/app-batch-2-contracts.md).
--
-- NOTHING IN THIS FILE IS REQUIRED. All three features ship on the columns
-- that already exist, so the endpoints never answer needs_migration:
--
--   crm_client_files   client_id, name, parent_path, is_folder, storage_key,
--                      url, mime, size, uploaded_by, created_at
--                      A phone upload writes the same row the web uploader
--                      writes; only storage_key is namespaced, "crm-media:<path>",
--                      because the bytes live in the public crm-media bucket
--                      instead of client-documents.
--
--   crm_agreements     status, signed_at, signed_date, signer_name,
--                      signature_method, file_url, sign_token, terms
--                      action=upload-signed writes exactly the fields sign.js
--                      writes, with signature_method = 'upload' and the audit
--                      note under terms.signed_outside:
--                        { at, by, by_user_id, note, signed_on,
--                          file_url, file_name, mime, size }
--
-- Storage buckets, both already in use, nothing to create:
--   crm-media          public. Phone uploads of client files land here, so the
--                      app can draw a thumbnail with no auth header.
--                      _lib/storage.js creates it on first use.
--   client-agreements  private. An uploaded signed copy lands here next to the
--                      PDFs sign.js generates, so file_url keeps its
--                      "bucket/path" shape and action=file can sign a link.
--
-- Everything below is optional and purely additive: run it for the read speed,
-- skip it with no loss of function. Both tables are small, so the plain
-- (non concurrent) form is fine in the Supabase SQL editor.

-- The Files tab and the client overview both read a client's files newest
-- first; the file manager also filters by folder.
create index if not exists crm_client_files_client_created_idx
  on crm_client_files (client_id, created_at desc);

-- The client page loads every agreement for one client, newest first.
create index if not exists crm_agreements_client_created_idx
  on crm_agreements (client_id, created_at desc);
