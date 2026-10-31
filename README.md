# Gather — Private Chat

Static chat app for GitHub Pages, powered by Supabase Auth, Postgres, Row Level Security, and Realtime.

## Publish with GitHub Pages
1. Open this repository's **Settings → Pages**.
2. Under **Build and deployment**, choose **Deploy from a branch**.
3. Choose branch **main** and folder **/(root)**, then save.
4. The expected site address is `https://sheanogo.github.io/`.

## Configure Supabase Auth
Open **Authentication → URL Configuration** in the Supabase project. Set **Site URL** to `https://sheanogo.github.io` and add `https://sheanogo.github.io` to the allowed redirect URLs.

## Security
Only the Supabase publishable key belongs in browser code. Never put a secret or service-role key in this repository. Row-level security restricts chat records to conversation members. The site code is public; do not send highly sensitive personal information through chat. Only share your username with people you know and trust.

## Files
- `index.html` — app interface
- `app.css` — responsive styling
- `app.js` — authentication and chat logic
- `favicon.svg` — site icon
