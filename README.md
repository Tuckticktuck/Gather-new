# Gather — Private Chat

Static chat app for GitHub Pages, powered by Supabase Auth, Postgres, Row Level Security, and Realtime.

## Publish with GitHub Pages
1. Open this repository's **Settings → Pages**.
2. Under **Build and deployment**, choose **Deploy from a branch**.
3. Choose branch **main** and folder **/(root)**, then save.
4. The expected site address is `https://tuckticktuck.github.io/Gather-new/`.

## Configure Supabase Auth
Open **Authentication → URL Configuration** in the Supabase project. Set **Site URL** to `https://tuckticktuck.github.io/Gather-new/` and add `https://tuckticktuck.github.io/Gather-new/` to the allowed redirect URLs.

## Security
Only the Supabase publishable key belongs in browser code. Never put a secret or service-role key in this repository. Row-level security restricts chat records to conversation members. The site code is public; do not send highly sensitive personal information through chat. Only share your username with people you know and trust.
