# Gather — Private Chat

Static chat app for GitHub Pages, powered by Supabase Auth, Postgres, Row Level Security, and Realtime.

## Publish with GitHub Pages
1. Open this repository's **Settings → Pages**.
2. Under **Build and deployment**, choose **Deploy from a branch**.
3. Choose branch **main** and folder **/(root)**, then save.
4. The expected site address is `https://tuckticktuck.github.io/Gather-new/`.

## Configure Supabase Auth
Open **Authentication → URL Configuration** in the Supabase project. Set **Site URL** to `https://tuckticktuck.github.io/Gather-new/` and add `https://tuckticktuck.github.io/Gather-new/` to the allowed redirect URLs.

## Install Gather

Gather is an installable Progressive Web App (PWA). Open the site over HTTPS and use the **Install** control or your browser's install option on supported browsers. On iPhone or iPad, open Gather in Safari, tap **Share → Add to Home Screen**, enable **Open as Web App** if shown, and tap **Add**.

The service worker caches only the public app shell (HTML, CSS, JavaScript, manifest, and icons). Authentication, conversations, attachments, and other account data are not stored in the offline cache. Signing in, sending messages, and syncing still require an internet connection.

## Security
Only the Supabase publishable key belongs in browser code. Never put a secret or service-role key in this repository. Row-level security restricts chat records to conversation members. The site code is public; do not send highly sensitive personal information through chat. Only share your username with people you know and trust.
