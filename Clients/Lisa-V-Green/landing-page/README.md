# Prayer guide landing page

Email capture page for the free lead magnet, *When You Do Not Have the Words*
(17 pages, twelve prayers). This is the top of the month-1 funnel: it collects the
email, the welcome sequence delivers the PDF, and the devotional at $13.95 is the
offer that follows.

Target URL: `lisavgreeninspires.com/prayer-guide`

## Files

| File | What it is |
|---|---|
| `index.html` | The page. Static, no build step, no framework |
| `styles.css` | All styling. Brand tokens live in `:root` at the top |
| `script.js` | Form validation, submit, success state. **Set `CONFIG.endpoint` here** |
| `assets/` | Hero artwork, ebook mockups, portrait, sample page, book photo |

## The one thing to set before launch

Open `script.js` and fill in `CONFIG.endpoint`. Until it has a value the form runs
in demo mode: it validates, shows the real success state, and posts nothing. That is
deliberate so the page can be previewed and approved without creating subscribers.

**Option A, MailerLite embedded form** (matches the recommended stack in
`../client-profile.md`, account in Lisa's name)

```js
endpoint: "https://assets.mailerlite.com/jsonp/XXXXXX/forms/YYYYYY/subscribe",
mode: "mailerlite"
```

**Option B, VTM eCRM or any JSON endpoint**

```js
endpoint: "https://lisavgreeninspires.com/api/subscribe",
mode: "json"
```

Posts `{name, email, source, page}`. `source` defaults to `prayer-guide-landing`
so the welcome sequence can branch on where the lead came from.

**Option C, separate thank-you page** instead of the inline success panel

```js
redirect: "/prayer-guide/thank-you"
```

## Deploying

Static files. Drop the folder anywhere, or on Vercel:

```bash
vercel --prod
```

Nothing to build and nothing to install. The only external requests are the two
Google Fonts families.

## Brand tokens

Sampled from the approved guide PDF and the month-one master approval, not eyeballed.

| Token | Hex | Used for |
|---|---|---|
| `--deep` | `#0a241a` | Hero and dark bands |
| `--forest` | `#123c2a` | Headings on cream, quote band |
| `--gold` | `#c6a252` | Accent, CTA, rules |
| `--cream` | `#f7f4ee` | Light bands |

Type is Cormorant Garamond for display and Jost for UI.

## Copy

Nearly all body copy on the page is Lisa's own writing, lifted from the guide:
the pull quote, the twelve titles, the "word from me to you" letter, and the
devotional section. Copy written for the page rather than taken from the guide is
the hero headline, the hero subhead, and the four "inside every page" items.

**Before this goes live it needs her affirmative written approval.** Section 6.4 of
the signed agreement says faith and theological statements, personal testimony and
promotional claims cannot be approved by silence.

## Known follow-ups

- `assets/book-cover.png` is cropped from the existing cover photo. The master
  approval still lists a high resolution photo of the book as outstanding on Lisa's
  side; swap it in when it arrives.
- Footer links to `/privacy`, `/terms` and `/contact` are placeholders until those
  pages exist on the site.
- The devotional CTA points at `/devotional`. Repoint it at the Stripe checkout once
  direct book sales are live.
