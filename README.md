# Gather — Private Chat

Gather is a static Progressive Web App powered by **GitHub Pages** and **Supabase**.

## Hosting and backend

- **GitHub** (Tuckticktuck/Gather-new) stores the source code and publishes the frontend through the GitHub Pages workflow in .github/workflows/pages.yml.
- **Supabase** provides authentication, Postgres, Row Level Security, storage, and realtime features.

The frontend has no framework build step. GitHub Actions compiles the Tag Canvas engine, validates the JavaScript, and publishes the repository root to GitHub Pages whenever changes are pushed to main.

## GitHub Pages setup

1. Open the repository's **Settings → Pages**.
2. Set the publishing source to **GitHub Actions**.
3. Confirm the workflow in .github/workflows/pages.yml is enabled.
4. Push changes to main; the workflow publishes the site.
5. Check the **Actions** tab for build and deployment status.

The current GitHub Pages address is:

https://tuckticktuck.github.io/Gather-new/

## Supabase Auth configuration

In the Supabase project **Private Chat**, open **Authentication → URL Configuration**. Set the Site URL to the GitHub Pages address and add it to the allowed redirect URLs. Test sign-in, sign-up, password recovery, and email confirmation links after changing the URL configuration.

Do not put Supabase service-role keys or other server secrets in frontend files. The browser app must use only the public/publishable client key.

## Install Gather

Gather is an installable Progressive Web App. Open the site over HTTPS and use the **Install** control or your browser's install option on supported browsers. On iPhone or iPad, open Gather in Safari, tap **Share → Add to Home Screen**, enable **Open as Web App** if shown, and tap **Add**.

The service worker caches only the public app shell (HTML, CSS, JavaScript, manifest, and icons). Authentication, conversations, attachments, and other account data are not stored in the offline cache. Signing in, sending messages, and syncing require an internet connection.
