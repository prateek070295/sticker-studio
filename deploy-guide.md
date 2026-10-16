# Cloudflare Pages Deployment & Sharing Guide (₹0 Forever)

Sticker Studio is configured as a fully client-side Progressive Web App (PWA). It requires **zero server-side code, zero databases, and zero API keys**.

By hosting it on **Cloudflare Pages Free Tier**, you get:
- **₹0 Monthly Cost**: Unlimited requests, unlimited bandwidth, free SSL certificate.
- **Permanent Free Subdomain**: `https://<your-project>.pages.dev`.
- **Global CDN & Edge Delivery**: Instant loading worldwide.
- **Client-Side Privacy**: Cloudflare only serves static assets; 100% of user-uploaded images and exports remain on the user's computer/phone.

---

## Method 1: Git-Based Automatic Deployment (Recommended)

This connects your GitHub repository to Cloudflare Pages. Every time you push a change to `main`, Cloudflare automatically builds and deploys the new version:

1. Push this codebase to a GitHub repository (e.g. `https://github.com/<username>/sticker-studio`).
2. Log in to [Cloudflare Dashboard](https://dash.cloudflare.com/) (sign up for free if you don't have an account).
3. In the left sidebar, navigate to **Workers & Pages** → **Create application** → **Pages** → **Connect to Git**.
4. Select your GitHub repository.
5. In the **Build Settings** configuration:
   - **Project name**: `sticker-studio` (or your choice)
   - **Production branch**: `main`
   - **Framework preset**: `Vite`
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
   - **Node.js version**: (Default or add environment variable `NODE_VERSION: 20`)
6. Click **Save and Deploy**.
7. In ~1 minute, Cloudflare will provide your live URL:
   `https://sticker-studio.pages.dev`

---

## Method 2: Direct CLI Deployment via Wrangler (No Git Required)

You can also deploy directly from your local terminal using Cloudflare's free `wrangler` CLI:

1. Build the production bundle:
   ```bash
   npm run build
   ```
2. Deploy the `dist/` directory:
   ```bash
   npx wrangler pages deploy dist --project-name sticker-studio
   ```
3. If this is your first time, Wrangler will open a browser window for a free one-click login to Cloudflare.
4. Your website will be live instantly at `https://sticker-studio.pages.dev`.

---

## Sharing with Family Members

1. Send your family members the link: `https://<your-project>.pages.dev`
2. They can immediately open it in any modern browser (Chrome, Edge, Safari, Firefox) on Windows, Mac, iPhone, iPad, or Android.
3. **No Login / No Sign Up**: They can start extracting stickers immediately.

---

## How Family Members Can Install It on Windows

1. Open `https://<your-project>.pages.dev` in **Google Chrome** or **Microsoft Edge**.
2. Click the **"Install App"** button in the top-right toolbar, or click the **Install icon** on the right side of the browser address bar.
3. Click **Install**.
4. Sticker Studio will open in its own standalone window without browser tabs or address bar, and a shortcut will be added to their Desktop and Start Menu.
5. **Offline Use**: Once opened for the first time, all application files are automatically cached locally. A green **"Available Offline"** indicator will confirm that they can use the app without an internet connection.

---

## Publishing Future Updates Safely

When you push updates to GitHub or re-run `npx wrangler pages deploy dist`:
1. Users currently using the app will not have their active work interrupted.
2. A subtle **"Update Available"** badge will appear in their toolbar once the new assets are cached.
3. Clicking **"Update Available"** cleanly reloads the application into the latest version.
