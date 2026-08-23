# Google Drive setup for Aardra's Library

This guide takes the project from a fresh download to a working local website whose images and structured library details are stored in your Google Drive.

## 1. What this version stores

The application creates a normal folder named **Aardra's Library** in the Google Drive account you authorize. Inside it, the application manages:

- `aardras-library-data.json` — concepts, sections, subsections, descriptions, numbering/order, and image metadata;
- image files — the original JPG, PNG, or WEBP uploads shown by each subsection.

Drive is authoritative after that JSON file is created. The browser never receives your Google client secret, refresh token, or a direct Drive authorization token. Image view and download requests pass through the server.

The app requests only Google's narrow `drive.file` scope. Google describes it as per-file access for files created or opened by the app, rather than access to every file in your Drive. See Google's [Drive scope guide](https://developers.google.com/workspace/drive/api/guides/api-specific-auth).

## 2. Prerequisites

- A Google account with Google Drive.
- A Google Cloud project you control.
- Node.js **22.13.0 or newer** and npm.
- The extracted project folder.

Check Node and npm:

```bash
node --version
npm --version
```

## 3. Create the Google Cloud project

1. Open the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a project, for example `Aardras Library`.
3. Select that project.
4. Open **APIs & Services → Library**.
5. Search for **Google Drive API** and click **Enable**.

The app uses the official Drive REST API for [multipart uploads](https://developers.google.com/workspace/drive/api/guides/manage-uploads), [file downloads](https://developers.google.com/workspace/drive/api/guides/manage-downloads), and [file search](https://developers.google.com/workspace/drive/api/guides/search-files).

## 4. Configure Google OAuth

Google's console may label this area **Google Auth Platform** or **OAuth consent screen**.

1. Open **Google Auth Platform → Branding** and enter an app name such as `Aardra's Library` plus your support email.
2. Under **Audience**, choose:
   - **Internal** if you use a Google Workspace organization and only its members need access; or
   - **External** for a personal Google account.
3. If the app is in **Testing**, add the Google account that will own the Drive folder as a test user.
4. Under **Data Access / Scopes**, add:

   ```text
   https://www.googleapis.com/auth/drive.file
   ```

5. Open **Clients → Create client**.
6. Choose **Web application**.
7. Give it a name such as `Aardra Library local authorization`.
8. Add this exact **Authorized redirect URI**:

   ```text
   http://127.0.0.1:53682/oauth2callback
   ```

9. Create the client and copy its **Client ID** and **Client secret**.

Google's [web-server OAuth guide](https://developers.google.com/identity/protocols/oauth2/web-server) explains the offline-access flow used by the included helper. The refresh token is stored server-side and is used to obtain short-lived access tokens.

## 5. Create the local secret file

From the project folder, copy the example file.

macOS/Linux:

```bash
cp .dev.vars.example .dev.vars
```

Windows PowerShell:

```powershell
Copy-Item .dev.vars.example .dev.vars
```

Open `.dev.vars` and enter the client values. Leave the refresh token placeholder temporarily:

```dotenv
GOOGLE_CLIENT_ID=123456789-example.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-real-client-secret
GOOGLE_REFRESH_TOKEN=temporary-placeholder
GOOGLE_DRIVE_FOLDER_NAME="Aardra's Library"
LIBRARY_ACCESS_USERNAME=aardra
LIBRARY_ACCESS_PASSWORD=choose-a-long-private-password
```

`.dev.vars` is ignored by Git. Never commit it, upload it, put these values in a `NEXT_PUBLIC_...` variable, or send the values in chat.

## 6. Obtain the refresh token

Run:

```bash
npm run drive:authorize
```

The helper reads the Client ID and Client secret from `.dev.vars`, starts a temporary callback server on your computer, and prints a Google authorization URL.

1. Open the printed URL in a browser.
2. Sign in to the Google account whose Drive should own the library.
3. Approve the requested Drive access.
4. Return to the terminal.
5. Copy only the value printed after `GOOGLE_REFRESH_TOKEN=`.
6. Replace `temporary-placeholder` in `.dev.vars` with that value.

The callback server closes automatically. The refresh token is not displayed in the browser.

Important: Google limits refresh-token lifetime while an external OAuth app remains in **Testing**. For a stable long-running deployment, move the OAuth app to **In production** after completing the consent configuration. Google's [production-readiness guidance](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification) documents the limited testing-token lifetime.

## 7. Install and run locally

Install the exact locked dependencies:

```bash
npm ci
```

Start development mode:

```bash
npm run dev
```

Open the URL printed in the terminal, normally:

```text
http://localhost:5173
```

If you kept `LIBRARY_ACCESS_PASSWORD`, the browser will show a sign-in prompt. Enter the configured username (default `aardra`) and password.

On the first library request, the server will:

1. exchange the refresh token for a short-lived Google access token;
2. find or create the app-owned **Aardra's Library** Drive folder;
3. find or create `aardras-library-data.json`;
4. seed the SQL workspace when no previous library exists.

The initial descriptions are blank. A description is stored and shown only when you enter one.

## 8. Verify Google Drive storage

1. Open the website and create a test section or subsection.
2. Upload an image to that subsection.
3. Open Google Drive and locate **Aardra's Library**.
4. Confirm that the folder contains the JSON file and the uploaded image.
5. Use **View image** and **Download** in the website.
6. Delete the image from the website and confirm the corresponding Drive file is removed.

Do not manually edit the JSON file while the website is running. If you want a backup, download or copy the entire Drive folder.

## 9. Existing-site migration

The included `.openai/hosting.json` keeps the previous `DB` (D1) and `BUCKET` (R2) bindings only as legacy migration sources.

When `aardras-library-data.json` does not yet exist, the Drive repository attempts a one-time migration:

1. read the existing concepts, topics, and image metadata from D1;
2. read each existing image from R2;
3. upload the images into Google Drive;
4. write the converted metadata JSON using the same numeric IDs.

After the JSON file exists, every read and new write uses Google Drive. The migration does **not** delete the old D1/R2 data, so it remains a fallback copy until you deliberately remove it later.

For a fresh local installation, legacy tables are absent and the app simply creates the clean SQL starter structure.

## 10. Production build

Type-check, lint, and build before deployment:

```bash
npx tsc --noEmit
npm run lint
npm run build
```

The build produces the worker output used by the Sites/Vinext runtime. Start an already-built copy with:

```bash
npm run start
```

## 11. Configure a hosted deployment

Add these as **server-side secrets/environment variables** in your hosting platform:

| Variable | Required | Purpose |
| --- | --- | --- |
| `GOOGLE_CLIENT_ID` | Yes | OAuth web client ID |
| `GOOGLE_CLIENT_SECRET` | Yes | OAuth web client secret |
| `GOOGLE_REFRESH_TOKEN` | Yes | Offline token for the Drive owner |
| `GOOGLE_DRIVE_FOLDER_NAME` | No | Folder name; defaults to `Aardra's Library` |
| `LIBRARY_ACCESS_USERNAME` | No | Optional HTTP Basic username; defaults to `aardra` |
| `LIBRARY_ACCESS_PASSWORD` | Strongly recommended when hosted | Enables the built-in whole-site password gate |

Do not copy `.dev.vars` into a deployment artifact. Use the host's secret manager or environment-variable settings, then redeploy so the worker receives the bindings.

For an update of the existing Sites project, keep the D1/R2 bindings for the first Drive-backed deployment so automatic migration can run. Visit the library once and verify Drive before considering removal of the legacy bindings.

### Deployment security

This is a personal workspace with create, upload, replace, and delete endpoints. Prefer your hosting platform's private access control. As a portable fallback, set `LIBRARY_ACCESS_PASSWORD` (and optionally `LIBRARY_ACCESS_USERNAME`) to enable the included whole-site browser password prompt. Use HTTPS in production and choose a unique, long password. Do not expose the write endpoints anonymously on a public URL connected to your personal Drive.

The three Google credential variables must remain server-only. The source never returns them to the UI and never writes them into the Drive JSON file.

## 12. Image upload limits

- Accepted source types: JPG, PNG, WEBP.
- Image upload limit: 10 MB.
- Images are uploaded in their original format, dimensions, and quality.

The upload client reads the response as text first and safely handles non-JSON platform errors, so a `Payload Too Large` response does not become an `Unexpected token p` JSON error.

## 13. Troubleshooting

### `Google Drive storage is not configured`

One of the three required values is missing from `.dev.vars` or the hosted server environment. Confirm the exact names and restart/redeploy.

### `redirect_uri_mismatch`

Edit the OAuth web client and add exactly:

```text
http://127.0.0.1:53682/oauth2callback
```

Do not replace `127.0.0.1` with `localhost`, and do not omit the port or path.

### Google does not return a refresh token

The helper already requests `access_type=offline` and `prompt=consent`. If the token is still absent, remove this app from your Google Account's connected-app permissions, then run `npm run drive:authorize` again.

### `invalid_grant`

The refresh token was expired, revoked, generated for a different OAuth client, or limited by Testing status. Run the authorization helper again and update the server secret. Move the OAuth app to **In production** for long-lived use.

### `access_denied`

If the OAuth app is in Testing, add the Drive owner's Google account to the OAuth test-user list. Also confirm you signed into the intended account.

### `insufficient authentication scopes`

Confirm that the authorization request grants:

```text
https://www.googleapis.com/auth/drive.file
```

Revoke the old connection and authorize again after correcting the scope.

### Image says it is too large

Choose a JPG/PNG/WEBP smaller than 10 MB. Images are uploaded unchanged and are not compressed automatically.

### JSON data file was changed manually

Restore a valid copy of `aardras-library-data.json` in Drive. The expected top-level keys are `version`, `nextIds`, `concepts`, `topics`, and `assets`. The safest recovery is to restore a Drive revision or a backup copy rather than reconstructing IDs manually.

### Moving to another Google account

Run the authorization helper while signed into the new account, replace `GOOGLE_REFRESH_TOKEN`, and restart/redeploy. A new app-owned folder is created in that account. Copying the old folder alone is not sufficient under the narrow `drive.file` scope; keep the same OAuth client and perform a controlled data migration if existing content must move.

## 14. Revoke access

To disconnect the application:

1. Remove the app from your Google Account's third-party connections.
2. Delete or rotate `GOOGLE_REFRESH_TOKEN` in every environment.
3. Restart/redeploy the application.

Revoking the token stops API access but does not delete the Drive folder or its files.
