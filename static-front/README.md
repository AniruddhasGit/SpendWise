# SpendWise cold-start front (READY — not deployed)

A self-contained static page (no build, no dependencies) that covers the
**60-90s Render cold start**: when the backend is asleep it serves nothing, so
a page served *by it* can't appear. This page is hosted on an **always-on static
host** instead — it paints instantly, plays the gold-coin intro, wakes the
backend in the background, and hands off when it's up.

## Why NOT Render

An always-on service on Render would run ~720 hours/month against the **750
free instance-hours shared across all your apps** (Retain, SpendWise, FrontRow)
— it would eat almost your entire month. Host this on a host that doesn't count
against that quota.

## Recommended: Cloudflare Pages (free, always-on, zero quota)

1. Push this repo (or just `static-front/`) to GitHub (already done).
2. Cloudflare dashboard → **Pages** → Create → connect this repo.
3. Build settings: **Framework preset: None**, **Build command: (empty)**,
   **Build output directory: `static-front`**.
4. Deploy. You get a `*.pages.dev` URL (or attach a custom domain).

Alternatives with the same result: **Netlify** (drag-drop the `static-front`
folder) or **GitHub Pages** (serve the folder).

## Before deploying — set the two URLs

Edit the `<script>` config at the bottom of `index.html`:

```js
var APP_URL     = "https://spendwise-bvp4.onrender.com/";  // the real app
var BACKEND_URL = "https://spendwise-bvp4.onrender.com";   // its /healthz
```

Leave them as-is if the app stays at that URL. If you later rename the Render
service, update both.

## How it decides "ready"

It fires `fetch(BACKEND_URL + "/healthz", { mode: "no-cors" })`. Render **holds**
the request during a cold start and answers once the container is live, so the
fetch *resolving* means the server is awake. `/healthz` is a liveness route that
does **not** touch the database, so **no Neon compute is spent** warming up. The
ping fires **once per visit** (user-triggered) — never on a timer, so it adds no
keep-awake load. Then it redirects to `APP_URL`.

## The front-door decision (yours)

This makes the static page the shared **front door**. That changes which URL you
hand out (put the `*.pages.dev`/custom-domain link on your résumé/GitHub; the
raw `onrender.com` URL just stops being the one you share). That's an
outward-facing choice, so it was left for you — nothing here is live until you
deploy it.
