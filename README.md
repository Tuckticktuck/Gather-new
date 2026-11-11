# Gather — Private Chat

Static chat app powered by Supabase Auth, Postgres, Row Level Security, and Realtime.

## Hosting architecture
- **GitHub** (`Tuckticktuck/Gather-new`) is the source-code repository.
- **Netlify** hosts the static frontend and can deploy updates automatically from the GitHub `main` branch.
- **Supabase** remains the backend for authentication, database access, storage, and realtime features.

The frontend does not require a framework build step. `netlify.toml` sets the publish directory to the repository root (`.`).

## Connect this repository to Netlify
1. In Netlify, choose **Add new project → Import an existing project**.
2. Choose **GitHub** and authorize access to `Tuckticktuck/Gather-new`.
3. Select the `main` branch.
4. Leave the build command empty and set the publish directory to `.` (the repository root). The committed `netlify.toml` also supplies this publish setting.
5. Deploy a preview first. Do not change the public production URL until authentication and core chat features have been tested.

Protect preview deployments or use a separate staging Supabase project. Preview URLs can be opened by anyone who has the URL unless access protection is enabled.

## Configure Supabase Auth after choosing the Netlify URL
In the Supabase project **Private Chat**, open **Authentication → URL Configuration**. Add the exact Netlify production URL to the allowed redirect URLs. Update the **Site URL** only when ready to make Netlify the primary address. Keep the existing GitHub Pages URL in the allowed redirect list during the transition. Also test password recovery and email confirmation links from the new domain.

Do not put Supabase service-role keys or other server secrets in frontend files or Netlify's published output. The browser app must use only the public/publishable client key.

## Existing GitHub Pages fallback
The existing GitHub Pages site can remain available while Netlify is tested:
`https://tuckticktuck.github.io/Gather-new/`

Do not disable GitHub Pages until the Netlify deployment and Supabase authentication flow have been verified.

## Install Gather

Gather is an installable Progressive Web App (PWA). Open the site over HTTPS and use the **Install** control or your browser's install option on supported browsers. On iPhone or iPad, open Gather in Safari, tap **Share → Add to Home Screen**, enable **Open as Web App** if shown, and tap **Add**.

The service worker caches only the public app shell (HTML, CSS, JavaScript, manifest, and icons). Authentication, conversations, attachments, and other account data are not stored in the offline cache. Signing in, sending messages, and syncing require an internet connection.
