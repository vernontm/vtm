# App batch 2: inbox, clients, calendar, dashboard, assistant, money

Ray's list from 2026-09-26. Several streams run in parallel and meet at the
shapes below. Change a shape here first, then in code.

## Rules for everyone

- NO em dash or en dash anywhere: code, comments, UI copy. Use a comma, a
  period, a colon, the house middle dot, or the word "to".
- Do not commit, push, or run any git write command. Do not start EAS builds.
  Do not run build-crm.sh. Do not start dev servers or open browsers.
- Schema changes are propose only: add them to `docs/sql/app-batch-2.sql`
  for Ray to run. Every endpoint that needs a new column or table must answer
  `503 { error, needs_migration: true }` when it is missing, never throw.
- Mobile is Expo SDK 57 / React Native 0.86. Use the Aura primitives in
  `mobile/components/ui.js` and the tokens in `mobile/lib/theme.js`. Ionicons
  only, never emoji as icons. Repeated blocks inside a screen are plain
  functions, not inner components, or a TextInput loses focus on every render.
- API files under `New/api/crm/` are CommonJS unless the file is already ESM.
- Never put customer data in the repo.
- Verify: `node --check` on API files; for app files parse with
  `node -e 'require("@babel/parser").parse(require("fs").readFileSync(F,"utf8"),{sourceType:"module",plugins:["jsx"]})'`
  from `mobile/`. Then scan every touched file for dashes with node
  (`/[\u2013\u2014]/`) and fix any.

## Native modules already installed (do not add more without saying so)

`expo-audio` (record and play voice notes, microphone permission is already in
app.json), `expo-video` (in app video playback), `expo-document-picker` (pick
a file), `expo-file-system`, `expo-image-picker` (already used). All of these
need a native build, which Ray will run when the whole batch is in.

## Existing pieces to reuse, not rebuild

- Media upload: `POST /api/crm/imessage?action=upload-url` body `{ name }`
  returns `{ uploadUrl, publicUrl }`; PUT the bytes with the right
  Content-Type; then send with `attachments`. Helper in `mobile/lib/api.js`:
  `uploadFile(localUri, name, mime)` returns `{ url, size, mime }`.
- An attachment is `{ url, type: 'image'|'video'|'audio'|'file', name, mime,
  size, width, height }` and lives on `crm_sms_messages.attachments`.
- Transcription: `POST /api/transcribe` takes multipart audio and returns
  `{ text }` from ElevenLabs speech to text. It is currently UNAUTHENTICATED
  and open to the world: the API stream locks it down.
- Files on a client: `New/api/crm/client-files.js` already lists them.
- Agreements: `New/api/crm/agreements.js`, statuses draft, sent, signed.

## New API surface

### Conversation organization (`New/api/crm/imessage.js`)

Columns on `crm_imessage_threads`: `starred boolean default false`,
`archived_at timestamptz`. Actions:

- `POST ?action=star` body `{ phone, starred }` returns `{ ok, starred }`.
- `POST ?action=archive` body `{ phone, archived }` returns `{ ok, archived }`.
- `POST ?action=delete` body `{ phone }` soft deletes: archive the thread and
  mark its messages hidden. Do NOT hard delete message rows; add
  `deleted_at timestamptz` to `crm_sms_messages` and filter it out
  everywhere the inbox reads. Returns `{ ok }`.
- The thread list (`GET /imessage`) returns `starred` and `archived` on each
  thread and omits archived threads unless `?archived=1`.

### Voice notes

A voice note is an attachment with `type: 'audio'` plus `transcript` and
`duration_ms` on the attachment record. When a voice note is sent or received,
the server transcribes it and stores the text on the attachment so it is
searchable and readable without playing it. Transcription failure is not an
error: the attachment simply has no transcript.

### Money only counts CRM clients

`New/api/crm/home.js` already resolves each unpaid invoice to a client. Rows
that resolve to nobody must be dropped from `held_up`, `unpaid` and the
`outstanding` total, rather than falling back to a raw billing email. The lead
owns this change.

## App conventions for this batch

- In app viewer: tapping any attachment opens it inside the app, never the
  browser. Images in a full screen viewer, video with `expo-video`, audio with
  an inline player, PDFs and other files in a viewer screen with a share
  action. One shared component, `mobile/components/MediaViewer.js`.
- Dictation: a mic button on a text input records with `expo-audio`, uploads,
  calls `/api/transcribe`, and puts the text in the field. Same component
  everywhere, `mobile/components/DictateButton.js`.

## Ownership, so two streams never touch one file

- Conversation stream: `mobile/screens/ConversationScreen.js`,
  `mobile/components/MediaViewer.js`, `mobile/components/DictateButton.js`,
  `mobile/components/VoiceNote.js`.
- Inbox list stream: `mobile/screens/MessagesScreen.js`,
  `mobile/screens/NewMessageScreen.js`.
- Clients stream: `mobile/screens/ClientDetailScreen.js`, plus
  `New/api/crm/client-files.js` and `New/api/crm/agreements.js`.
- Small UI stream: `mobile/screens/CalendarScreen.js`,
  `mobile/components/homes/CeoHome.js`, `mobile/screens/AssistantScreen.js`.
- API stream: `New/api/crm/imessage.js`, `New/api/transcribe.js`,
  `docs/sql/app-batch-2.sql`.
- Lead: `mobile/lib/api.js`, `New/api/crm/home.js`, `mobile/App.js`, commits.

Everyone may READ any file. Only the owner writes it. If you need a helper in
`mobile/lib/api.js`, do not add it yourself: name it in your reply and the
lead adds it. Assume these helpers will exist and call them:

`starThread(phone, starred)`, `archiveThread(phone, archived)`,
`deleteThread(phone)`, `getImsgThreads({ archived })`,
`transcribeAudio(localUri)`, `uploadClientFile(clientId, localUri, name, mime)`,
`uploadSignedAgreement(agreementId, localUri, name, mime)`.
