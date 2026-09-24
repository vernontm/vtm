# Website and landing pages

The prayer guide landing page used to live in this repo at
`Clients/Lisa-V-Green/landing-page`. It was split out on 2026-09-23 so the source
is hers to own and transfer, per section 9 of the signed agreement.

| Thing | Where |
|---|---|
| Source | https://github.com/vernontm/lisa-v-green-site (private) |
| Working copy | `Client Projects/Lisa V Green/` |
| Live | https://lisa-prayer-guide.vercel.app |
| Vercel project | `lisa-prayer-guide` on `ray-6991`, deploys from `main` |

Commercial documents for the engagement stay in this folder. Only the website
source moved.

## Open items

- The opt-in runs in demo mode until `CONFIG.endpoint` is set in `script.js`.
- Vercel project sits on Ray's personal account. The agreement puts the hosting
  account in Lisa's name, so it still needs transferring to her.
- `lisavgreeninspires.com` and `www` are registered on the Vercel project, but DNS
  still points at her WordPress site on AWS. Cutting the root over takes that site
  offline, including the shop, cart and my-account, and 404s eighteen live pages.
- Her email is Rackspace on the same domain. Change only the A records at GoDaddy.
  Moving nameservers to Vercel drops the MX and SPF records and kills her mail.
