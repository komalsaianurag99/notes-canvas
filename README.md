# Aardra's Library

A responsive personal knowledge library for concepts, numbered sections, numbered subsections, and image-based learning notes. It includes light/dark themes, concept and topic management, image preview/view/download controls, and delete/replace actions.

This edition stores the entire library in the owner's Google Drive:

- concepts, sections, subsections, ordering, and image metadata are stored in `aardras-library-data.json`;
- uploaded images are stored as regular Drive files;
- OAuth credentials remain on the server and are never sent to the browser;
- an existing Sites D1/R2 library is migrated automatically the first time Drive storage starts.

## Quick start

1. Install Node.js 22.13 or newer.
2. Follow [GOOGLE_DRIVE_SETUP.md](./GOOGLE_DRIVE_SETUP.md) to create the Google OAuth credentials and `.dev.vars` file.
3. Install and run:

   ```bash
   npm ci
   npm run dev
   ```

4. Open the local URL printed by Vite (normally `http://localhost:5173`).

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the local development server |
| `npm run drive:authorize` | Obtain the one-time Google refresh token |
| `npm run build` | Build the production worker |
| `npm run start` | Start the already-built application |
| `npm run lint` | Check the source with ESLint |
| `npx tsc --noEmit` | Type-check the source |

## Main source locations

| Path | Responsibility |
| --- | --- |
| `app/` | Pages, responsive UI, API routes, theme, image workflow |
| `storage/google-drive.ts` | OAuth, Drive API, JSON repository, migration |
| `storage/types.ts` | Persistent data model and clean SQL starter data |
| `scripts/google-drive-auth.mjs` | Local OAuth authorization helper |
| `.dev.vars.example` | Required local server variables |
| `.openai/hosting.json` | Legacy D1/R2 bindings used only for first migration |

The complete installation, OAuth, migration, deployment, security, and troubleshooting instructions are in [GOOGLE_DRIVE_SETUP.md](./GOOGLE_DRIVE_SETUP.md).
