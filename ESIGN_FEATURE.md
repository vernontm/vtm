# In-House E-Signing Feature — Implementation Spec

A self-hosted "send → frictionless sign → signed PDF → auto client account" flow.
No per-signature vendor fees (esign.com / DocuSign). Built on Supabase + Vercel
serverless + pdf-lib, but the design is stack-agnostic.

---

## 1. The flow (what the user experiences)

1. **Admin** builds/approves a Service Agreement (+ optional NDA) for a client.
2. Admin clicks **Send** → the system mints an unguessable `sign_token`, sets the
   agreement status to `sent`, and **emails + texts the client a signing link**
   (`/sign?token=…`). No account required to sign (protects conversion).
3. **Client** opens the link → reviews the contract rendered as a real document →
   taps **Start signing** (sticky bottom bar) → **types or draws** their signature,
   which drops onto the actual signature line → **Next** (NDA) → **Finish**.
4. On finish the server: records the signature + **IP + timestamp**, **generates a
   signed PDF**, stores it on the client's file, **emails a copy to the client and
   to the admin**, then **auto-creates a real client account** and emails a
   **set-password link**.
5. Client clicks that link → sets a password → lands in their **logged-in portal**.

Key principle: **sign first (zero friction), provision the account after.**

---

## 2. Data model (Postgres)

```sql
-- Clients (existing table) needs:
alter table clients add column if not exists portal_user_id uuid;  -- links to auth user

-- Agreements
create table agreements (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  title text,
  total_amount numeric,
  status text default 'draft',        -- draft | approved | sent | signed
  file_url text,                      -- "bucket/path" of the signed PDF
  terms jsonb,                        -- { summary, installments[], monthly[], agreement_markdown, nda_markdown, signatures{} }
  -- signing/audit
  sign_token uuid unique,             -- frictionless signing link token
  sent_at timestamptz,
  signed_at timestamptz,
  signed_date date,
  signer_name text,
  signer_ip text,
  signer_user_agent text,
  signature_method text,              -- draw | type
  signature_value text,               -- typed name OR base64 PNG data URL
  created_at timestamptz default now()
);

-- Payment schedule derived from the agreement
create table payments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  agreement_id uuid references agreements(id) on delete set null,
  label text, amount numeric,
  status text default 'pending',      -- pending | paid
  due_condition text,                 -- "On signing", "On completion of X"
  paid_at timestamptz, stripe_invoice_id text, stripe_invoice_url text,
  source text default 'agreement',
  created_at timestamptz default now()
);

-- Outbound SMS queue (server can't send iMessage; a worker/agent delivers these)
create table sms_queue (
  id uuid primary key default gen_random_uuid(),
  client_id uuid, phone text, kind text, body text,
  status text default 'pending', sent_at timestamptz, created_at timestamptz default now()
);

-- Admin alert feed (optional but nice): "X signed the agreement"
create table client_alerts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid, type text, message text, read boolean default false,
  created_at timestamptz default now()
);
```

Plus a **private storage bucket** (`client-agreements`) for the signed PDFs.

---

## 3. Backend endpoints

### `agreements` (admin, authed)
- `GET ?client_id=` → `{ agreements[], payments[] }`
- `POST ?id=&action=send` → mint `sign_token` (if none), set `status=sent`,
  `sent_at=now()`, email the client `https://SITE/sign?token=<token>`, queue an SMS.
- `POST ?id=&action=file` → return a short-lived **signed URL** to the stored PDF.
- `PATCH ?id=&action=payment` → mark a payment paid/pending.

### `sign` (public, token-authed — the important one)
- `GET ?token=` → `{ status, business_name, owner_name, agreement_markdown, nda_markdown, total, installments, signed_at, signer_name }`. Validate the token is a UUID.
- `POST ?token=` body `{ consent, agreement_signature:{method,value,name}, nda_signature:{method,value} }`:
  1. Reject if already signed.
  2. Capture `ip = x-forwarded-for[0]`, `ua = user-agent`, `now`.
  3. `PATCH agreement`: status=signed, signed_at, signer_name/ip/user_agent,
     signature_method/value, `terms.signatures = {agreement, nda, ip, user_agent}`.
  4. **Generate the signed PDF server-side** (see §4), upload to storage, set `file_url`.
  5. Sign a 7-day URL for the PDF → email a copy to **client** and **admin**.
  6. **Provision account** (see §5) → email the **set-password link** to the client.
  7. Queue the client's SMS; insert an admin alert.

### `agreement-ai` (optional — AI builder)
- `POST ?action=analyze` `{client_id}` → AI proposes billing + flags gaps
  (missing monthly hosting, no revision cap, no deposit, etc.).
- `POST ?action=generate` `{client_id, terms}` → AI drafts full Agreement + NDA
  markdown + installments (plain text for review, no PDF yet).
- `POST ?action=approve` `{client_id, draft}` → persist agreement + payment schedule.

### `portal-auth` (authed as the client's session)
- Resolve `clients` by `portal_user_id = auth.user.id` → return their tasks / status /
  agreement. Never exposes other clients or admin data.

---

## 4. Signed PDF — generate SERVER-SIDE (critical)

**Do NOT generate the PDF in the browser with html2canvas/html2pdf.** We tried; it
produced blank pages (off-screen/`position:fixed` capture), half-page top gaps
(captures at the scroll position), and left-clipped text (centered container +
`windowWidth`). It is not reliable and you can't verify it without a real device.

**Use a server library** (`pdf-lib`, pure JS, no native deps). Build a module
`buildAgreementPdf({ agreementMarkdown, ndaMarkdown, ownerName, signerName,
signatureMethod, signatureValue, ndaSignatureMethod, ndaSignatureValue,
signedDateLabel, signedTimeLabel, signerIp, documentId })` → returns PDF bytes.

Layout notes that made it clean:
- Letter page (612×792), ~56pt margins, Times family (Roman/Bold/Italic).
- Tiny markdown parser: `# ` = centered title, first bold line = subtitle,
  `## ` = navy heading, `- ` = bullet, else paragraph. Inline `**bold**` and
  `_italic_`. Sanitize smart quotes / em-dashes for the WinAnsi font set.
- Word-wrap by measuring `font.widthOfTextAtSize`; **coalesce consecutive
  same-style tokens into one `drawText`** (clean spacing, small files).
- Signature block: two columns; your side pre-signed, client side shows the typed
  name in italic OR the **embedded drawn PNG** (`doc.embedPng`), a rule line, then
  `name — role`, `Date:`, **`IP address:`**, `Signed: <timestamp>`.
- A footer **SIGNATURE CERTIFICATE**: signed by, signed at, IP, method, document ID.
- Page-break the NDA onto its own page.

The browser only **collects** the signature (typed string or canvas `toDataURL`)
and POSTs it. All rendering is server-side and deterministic — you can unit-test it
by writing the bytes to a file and eyeballing it.

---

## 5. Auto-create the client account + magic link (Supabase)

After signing, provision a real login (server-side, service-role key):

```js
// 1) create the user (idempotent; ignore "already registered")
POST {SUPABASE_URL}/auth/v1/admin/users
  { email, email_confirm:true, user_metadata:{ is_client:true, client_id } }
// 2) mint a set-password link
POST {SUPABASE_URL}/auth/v1/admin/generate_link
  { type:"recovery", email, options:{ redirect_to: "https://SITE/client" } }
  -> returns { action_link }        // or properties.action_link
// 3) save clients.portal_user_id = <user id>
// 4) email the action_link via your own sender (don't rely on Supabase SMTP)
```

The client page (`/client`) uses the Supabase JS client (anon key) to detect the
recovery session from the URL, prompt for a new password (`auth.updateUser`), then
load `portal-auth`. Returning clients use email + password.

**Set the Site URL + additional redirect URLs** in Supabase Auth settings to include
`https://SITE/client`, or the magic link won't redirect.

---

## 6. Email + SMS

- **Email** (signing link, signed copy, set-password) via whatever transactional
  sender you have (we reuse a Gmail OAuth `sendEmail`). Plain text + links is fine;
  the PDF is delivered as a signed-URL link (or attach it if your sender supports MIME).
- **SMS**: true server-side SMS needs Twilio. If you (like us) only have an
  iMessage-via-desktop path, **queue** the message in `sms_queue` and let a worker
  deliver it. Don't block signing on the text.

---

## 7. Anti-chargeback clauses (bake into the template)

Clear scope + deliverables; per-milestone acceptance sign-off; explicit
card-authorization / recurring-billing consent; delivery-and-receipt confirmation;
"raise billing questions with us and allow reasonable time to resolve **before**
any chargeback"; non-refundable deposit + pro-rata refund policy; and retain the
signed agreement + IP + timestamps as dispute evidence. *(Not legal advice — get
the template reviewed.)*

---

## 8. Dependencies & env

- **`pdf-lib`** (server) — the only new package.
- Supabase: `SUPABASE_URL`, service-role key (admin API + storage), anon key (client page).
- Transactional email sender (Gmail OAuth / Resend / etc.).
- Optional: `ANTHROPIC_API_KEY` for the AI agreement builder.
- Stripe (existing) if you flip lead→client on payment.

---

## 9. Gotchas / lessons learned

- **Browser PDF is a trap** — go server-side from day one (§4).
- html2canvas renders blank from `opacity:0`, off-screen `position:fixed`, and
  captures at the **scroll position** and with **centering offsets**.
- Supabase **`generate_link` won't redirect** unless the redirect URL is allow-listed
  in Auth settings.
- Store secrets/PDFs in a **private** bucket; hand out short-lived **signed URLs**.
- Keep the signing link **token-only** (uuid) and validate the format; never require
  login to sign.
- The signed PDF filename is deterministic (`<clientId>/signed-agreement-<agreementId>.pdf`,
  upsert) so re-signs overwrite cleanly.

---

## 10. File map (this build, for reference)

```
api/crm/agreements.js       # list, send, signed-url, payment status
api/crm/agreement-ai.js     # AI: analyze / generate / approve (optional)
api/crm/sign.js             # GET load, POST sign -> PDF -> emails -> account
api/crm/portal-auth.js      # authed client portal data
api/_lib/agreement-pdf.js   # pdf-lib generator (buildAgreementPdf)
/sign.html                  # guided document signer (draw/type, sticky bar, agreement->NDA)
/client.html                # client login + set-password + portal
```
