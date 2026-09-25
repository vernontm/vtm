# Agreement flow for the app: analyze, generate, approve, send, text the link

Taken from `New/api/crm/agreement-ai.js` and `New/api/crm/agreements.js` (2026-09-25 build).
Everything is `POST`, JSON body, `Authorization: Bearer <Supabase access token>`, base `https://www.vernontm.com/api/crm`.
A failed call answers a 4xx or 5xx with `{ error: "<message>" }`; `request()` in `mobile/lib/api.js` throws `Error(error)`, so the message can go straight into a toast.

App helpers (already in `mobile/lib/api.js`): `agreementAnalyze(client_id)`, `agreementGenerate(data)`, `agreementApprove(data)`, `sendAgreement(id)`, `textSignLink(id)`.

## Order of calls

1. `analyze`: optional, gives Ray a suggested total, split, questions and gaps before he types the terms.
2. `generate`: the draft (agreement markdown, NDA markdown, total, installments, monthly). Regenerate with `base` plus `instruction` to tweak it.
3. `approve`: saves the draft as the client's agreement (status `approved`), builds the payment rows and the deal. Keep the returned `agreement_id`.
4. `send` (email) and/or `text-sign-link` (iMessage): both mint the sign link and flip the status to `sent`. The client signs at `https://vernontm.com/sign?token=<sign_token>`; `sign.js` sets `signed` and `signed_at` and takes the deposit.

Statuses: `draft` to `approved` to `sent` to `signed`. The sign page only accepts a signature while the status is `sent`, so approve alone is not enough: step 4 must run.

## 1. analyze

`POST /agreement-ai?action=analyze`

```json
{ "client_id": "<crm_clients.id>" }
```

Reply `200`:

```json
{
  "suggested_total": 5000,
  "suggested_structure": "50% deposit, 50% at launch, hosting monthly",
  "suggested_installments": [{ "label": "Deposit", "amount": 2500, "trigger": "Due upon signing" }],
  "suggested_monthly": [{ "item": "Hosting and upkeep", "amount": 29 }],
  "questions": ["..."],
  "flags": ["..."]
}
```

`questions` and `flags` hold up to 6 strings each. Errors: `400 client_id required`, `500 Client not found`, `500 <model error>`. Needs `ANTHROPIC_API_KEY`. Takes roughly 5 to 15 seconds.

## 2. generate

`POST /agreement-ai?action=generate`

Fresh draft:

```json
{
  "client_id": "<crm_clients.id>",
  "terms": "<Ray's billing terms, free text, up to 4000 chars (the TERMS block from chat works too)>",
  "instruction": "<optional free text, applied on top of the terms and wins on conflict>",
  "mode": "custom"
}
```

`mode: "custom"` is only for the pick-a-plan flow (no amounts in the document, a `{{PAYMENT_SCHEDULE}}` token instead); leave it out for a normal fixed agreement.

Revise an existing draft (only the requested change is applied, everything else is preserved word for word):

```json
{
  "client_id": "<crm_clients.id>",
  "base": {
    "agreement_markdown": "<current agreement markdown>",
    "nda_markdown": "<current NDA markdown>",
    "total": 5000,
    "installments": [{ "label": "Deposit", "amount": 2500, "trigger": "Due upon signing", "status": "pending" }],
    "monthly": [{ "item": "Hosting and upkeep", "amount": 29 }]
  },
  "instruction": "add a $500 rush fee due with the deposit"
}
```

`base.agreement_markdown` being present is what switches revise mode on. `instruction` and `terms` are joined (instruction first) as the change request, so sending only `instruction` is fine.

Reply `200`, both modes (this object is the `draft` for approve):

```json
{
  "summary": "one line",
  "total": 5500,
  "installments": [{ "label": "Deposit", "amount": 3000, "trigger": "Due upon signing", "status": "pending" }],
  "monthly": [{ "item": "Hosting and upkeep", "amount": 29 }],
  "agreement_markdown": "# Service Agreement ...",
  "nda_markdown": "# Mutual NDA ...",
  "recap": "client-facing 2 to 4 sentences (fresh drafts only)",
  "features": [{ "title": "Custom website", "detail": "one sentence" }]
}
```

`recap` and `features` come back on fresh drafts (fully filled in custom mode) and are absent on revisions. Em and en dashes are stripped server-side. A revision returns the FULL revised documents: replace the local draft with the reply. Errors: `400 client_id required`, `500 The AI returned a malformed response: please try again.` (retry once), `500 <model error>`. Takes 20 to 60 seconds (8k output tokens): give the request a long timeout and a spinner.

## 3. approve

`POST /agreements?action=approve`

Form A, what `agreementApprove(data)` sends when the app holds a draft:

```json
{ "client_id": "<crm_clients.id>", "draft": { ...the generate reply... } }
```

The draft fields that are used: `total` (number), `installments` (array), `monthly` (array), `agreement_markdown`, `nda_markdown`, `summary` (optional). `recap` and `features` are ignored here. The server creates the `crm_agreements` row (or reuses an empty placeholder row for that client) with `status: "approved"`, `title: "Service Agreement: Vernon Tech & Media"`, `total_amount = draft.total`, `terms = { summary, installments, monthly, agreement_markdown, nda_markdown }`, then one `crm_payments` row per installment (`status: "pending"`, `due_condition = trigger`) and a deal (`stage: "Proposal"`) linked to the agreement.

Form B, an existing row (the web CRM path, after `agreement-ai?action=approve`):

`POST /agreements?action=approve&id=<agreement_id>` with body `{}` (or body `{ "id": "<agreement_id>" }`).

Reply `200`:

```json
{ "ok": true, "status": "approved", "deal_id": "<crm_deals.id>", "agreement_id": "<crm_agreements.id>" }
```

Already signed: `{ "ok": true, "alreadySigned": true, "deal_id": "...", "agreement_id": "..." }`.
Errors: `400 id required (or client_id and draft)`, `404 Agreement not found`.
Idempotent by id: repeating form B never duplicates payments or the deal. Form A twice creates a second agreement once the first has markdown, so keep `agreement_id` from the first reply and use form B (or send) from then on.

## 4. send (email the link)

`POST /agreements?action=send&id=<agreement_id>` with body `{}`.

Needs `contact_email` on the client (`400 Client has no email: add one on the client first.`). Mints `sign_token` if missing, sets `status: "sent"` and `sent_at` (every call), moves the lead to the Contract Sent column (`lead_temperature` and `follow_up_status` = `contract_sent`), emails the link through Gmail (an email failure is logged, not returned), and, when the client has a phone, drops a row in the legacy `crm_sms_queue` (the old Twilio path). The iMessage text is the next call.

Reply `200`:

```json
{ "ok": true, "link": "https://vernontm.com/sign?token=<sign_token>" }
```

## 5. text-sign-link (iMessage the link)

`POST /agreements?action=text-sign-link&id=<agreement_id>` with body `{}`.

Needs a usable `contact_phone` (`400 Client has no phone number: add one on the client first.`); `400 This agreement is already signed.` once signed. Mints the token if missing, sets `status: "sent"` (keeps an existing `sent_at`), moves the lead to Contract Sent, and queues `crm_sms_messages` (`direction: "out"`, `channel: "imessage"`, `status: "queued"`, the Mac bridge delivers it within seconds) with:

`Hi <first name>, your Vernon Tech & Media agreement is ready to sign: <link>`

The text is also logged in `crm_nudges` (kind `agreement`) when that table exists, so it shows in the agreement's nudge history.

Reply `200`:

```json
{ "ok": true, "phone": "+12815550142", "link": "https://vernontm.com/sign?token=<sign_token>" }
```

## Reading it back

`GET /agreements?client_id=<crm_clients.id>` answers `{ agreements: [...], payments: [...] }`: each agreement carries `id, title, status, total_amount, sign_token, sent_at, opened_at, signed_at, terms, payment_mode, deal_id, maintenance_subscription_id`; each payment `id, agreement_id, label, amount, status, due_condition, paid_at`. Build the sign link as `https://vernontm.com/sign?token=` plus `sign_token` (`SIGN_BASE` in `mobile/lib/api.js`).

After sending, an unsigned agreement appears in `GET /home` `held_up` after 3 days (kind `agreement`), and a reminder goes through `POST /nudges` with `{ kind: "agreement", id: <agreement_id> }` (draft first with `?action=draft`).

## Also available (not needed for the app's first pass)

- `POST /agreement-ai?action=chat` `{ client_id, messages: [{ role, content }] }` answers `{ reply, ready, terms }`; when `ready` is true, `terms` is the block to pass to generate.
- `POST /agreement-ai?action=save-doc` `{ client_id, agreement_id?, agreement_markdown?, nda_markdown?, total? }` stores hand edits without AI, answers `{ ok, agreement_id, terms }`.
- `POST /agreement-ai?action=client-email` `{ client_id, tone: "professional" | "friendly" | "gain", sign_url }` answers `{ subject, body }`.
- `POST /agreements?action=preview-token&id=` answers `{ token }` for opening `/sign?token=<token>&preview=1` without sending.
