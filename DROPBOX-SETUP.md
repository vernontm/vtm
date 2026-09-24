# Connecting the CRM to VTM's Dropbox

The code is built and deployed. It stays dormant until these three env vars exist.
Client files then land in **/Clients/&lt;Business Name&gt;/** in Ray's Dropbox.

## 1. Create the app (2 minutes, Ray only)

1. Go to https://www.dropbox.com/developers/apps and click **Create app**
2. Choose **Scoped access**, then **Full Dropbox** (needed to write under /Clients)
3. Name it `VTM CRM`
4. On the app's **Permissions** tab, tick these, then **Submit**:
   - `files.metadata.write`
   - `files.metadata.read`
   - `files.content.write`
   - `files.content.read`
   - `sharing.write`
5. On the **Settings** tab, copy the **App key** and **App secret**

## 2. Mint a refresh token

Open this URL in a browser, replacing `APP_KEY`, and approve:

```
https://www.dropbox.com/oauth2/authorize?client_id=APP_KEY&response_type=code&token_access_type=offline
```

Copy the code it gives you, then run this in a terminal with your real values:

```bash
curl -u "APP_KEY:APP_SECRET" \
  -d grant_type=authorization_code \
  -d code="PASTE_CODE_HERE" \
  https://api.dropboxapi.com/oauth2/token
```

The response contains `"refresh_token": "..."`. That token does not expire.

## 3. Set the three vars

```bash
cd "Client Projects/VTM"
vercel env add DROPBOX_APP_KEY production
vercel env add DROPBOX_APP_SECRET production
vercel env add DROPBOX_REFRESH_TOKEN production
vercel --prod --yes
```

Optional: `DROPBOX_ROOT` to change `/Clients` to something else.

## What it does once connected

- Upload routes to `/Clients/<Business Name>/<your folders>/file.ext`
- Folder structure in the CRM is mirrored as real Dropbox folders
- Download links are **short-lived (4 hours), minted on click**, so nothing is public
- Deleting a file in the CRM deletes it in Dropbox
- Existing Supabase files keep working; only new uploads go to Dropbox

## Note on your current Dropbox

Client folders already exist ad hoc at root: `Lupe Cafe`, `Lupe Cafe 08.15`,
`Hot Pilates`, `Kreamy Scoops`, `Cajun City`. These are NOT touched by the
integration, which only writes under `/Clients`. Moving them in is a manual
decision, and several are shared mounts, so moving them would change what the
other party sees.
