# Noty

A fast, self-hostable notes app with sticky-note **whiteboards**, images and links embedded right
in your notes, and proper multi-user accounts. Installs to your phone's home screen like a native app.

---

### Desktop canvas, drawing & product links

- **Mouse-pan anywhere** — drag empty canvas to pan, on infinite *and* fixed-size boards.
- **Scroll to zoom** — the wheel zooms toward the cursor (0.1x–4x); `Shift`+wheel pans sideways.
- **Drags release cleanly** — items follow the pointer only while the button is held.
- **Freehand drawing** — press `D` or the pencil, sketch with 7 colours and 4 nib sizes, then
  `Check` to commit the sketch as a single movable, resizable board item.
- **Shapes** — rectangle, ellipse, triangle, diamond, star, arrow and line, tinted with the
  sticky palette and resizable to any proportion.
- **Link cards resize dynamically** — the layout reflows as you drag the handle: compact pill
  when small, side-by-side thumbnail when wide, full banner plus description when tall.
- **Product links** — paste an Amazon/eBay/shop URL and Noty pulls the product image, price,
  original price and a `-30%` discount tag straight onto the card.

## Features

**Notes — the home for text, images and links**
- Rich note cards with 8 paper-tint palettes, pin / archive / trash flow, tags and tag filtering
- Autosaving editor (debounced) — nothing is ever lost
- **Images live inside notes**: click, drag-drop or paste straight from the clipboard
- **Links live inside notes too**: paste a URL and Noty unfurls its title, description and favicon into a tidy pill
- Full-text search across note text, tags and embedded links

**Whiteboard mode**
- **Two canvas modes**: *infinite* (pan and zoom forever) or *fixed* — an exact pixel page such as 1920×1080, with presets for FHD, HD, QHD, square, story and A4, plus any custom size up to 10000px
- On a fixed canvas the page is drawn as a real bordered sheet and items are clamped inside its bounds
- Pannable / zoomable (mouse wheel, ctrl+wheel to zoom, two-finger pinch on touch)
- Five item types: **sticky notes**, **URL cards**, **images**, **checklists** and **text labels**
- Every position, size, colour and rotation is saved to the server — it remembers exactly how you left it
- Four canvas backgrounds (dots, grid, lines, plain), duplicate/delete, fit-to-screen
- Double-click empty canvas to drop a sticky note

**URLs, everywhere you need them**
- Attach links to any **note** — shown as favicon pills you can click straight through
- Pin links as visual cards on a **whiteboard**, using the page's OG preview image as the thumbnail
- The server unfurls each URL to grab its real title, description and icon
- Paste a URL into the command palette to file it into a new note in one step
- No separate bookmarks screen: links belong to the note or board they relate to

**Sharing**
- Generate a public read-only short link (`/s/aB3xY7q2`) for any note or board
- Revocable at any time; shared boards render fully, no account needed to view

**Users & admin**
- Open self-signup, **which an admin can switch off at any time** (existing users unaffected)
- First account to register automatically becomes the administrator
- Admin panel: create users, grant/revoke admin, disable accounts, delete users, rename the instance
- Every user's notes, boards, images and links are fully isolated from each other

**Design & platform**
- Warm-paper light theme (default) and a deep-ink dark theme, 6 accent colours, drifting colour-blob backdrop, Bricolage Grotesque display type
- Command palette (`⌘K` / `Ctrl+K`) with fuzzy search and quick actions
- Keyboard shortcuts: `N` new note, `G`+`N/B/P` navigation, `F` fit board, `Del` remove item
- Installable PWA — works on **iOS "Add to Home Screen"** and **Android install**, with app shortcuts, offline shell caching and safe-area insets for notched phones
- Fully responsive: sidebar becomes a drawer, modals become true bottom sheets on mobile

**Feels alive on phones**
- **Bottom tab bar** for one-thumb navigation (Notes / Boards / Search / More), with a springy active indicator
- **Swipe note cards**: right to pin, left to archive — with a live action label, colour wash and a haptic tick the moment you cross the threshold. Axis-locked, so it never fights vertical scrolling
- **Drag-to-dismiss sheets**: pull down on any dialog; it rubber-bands, tracks velocity and flicks away
- **Pull to refresh** on the notes list, with a rotating indicator
- **Double-tap the canvas** to drop a sticky note; notes lift and scale when picked up and settle with a spring on release
- **Haptic feedback** throughout (Android Vibration API), toggleable in Settings — iOS ignores it, so every cue is visual too
- Staggered card entrances, shimmering skeleton loaders, animated counters, floating empty-state art and a gently pulsing compose button
- Everything honours `prefers-reduced-motion`
- One-click JSON export of all your data

---

## Quick start with Docker

```bash
cp .env.example .env          # then edit JWT_SECRET
docker compose up -d --build
```

Open <http://localhost:8080> — **the first account you register becomes the admin.**

Generate a real secret before exposing it anywhere:

```bash
openssl rand -hex 32
```

| Variable     | Default           | Purpose                                   |
| ------------ | ----------------- | ----------------------------------------- |
| `NOTY_PORT`  | `8080`            | Host port Noty is published on            |
| `JWT_SECRET` | `please-change-me`| Signs login tokens — **change this**      |
| `DATA_DIR`   | `/data`           | SQLite database + uploaded images         |

Everything (database and uploads) lives in the `noty-data` volume, so containers stay disposable:

```bash
docker compose down          # stop, keep data
docker compose down -v       # stop and wipe data
docker compose logs -f       # follow logs
```

The image is a 3-stage build: the web client is compiled with Vite, the server installs
production-only deps, and the runtime stage serves the API **and** the built SPA from a single
Node process on port 4000 as a non-root user, with a healthcheck on `/api/health`.

### Running behind a reverse proxy

Noty serves plain HTTP; terminate TLS at your proxy (Caddy, nginx, Traefik). Example Caddyfile:

```
notes.example.com {
    reverse_proxy localhost:8080
}
```

HTTPS is recommended — iOS only offers "Add to Home Screen" as a true standalone app over a secure origin.

---

## Local development

```bash
npm run install:all   # install server + web dependencies
npm run dev           # API on :4000, Vite dev server on :5173
```

Open <http://localhost:5173>; Vite proxies `/api` to the backend automatically.

---

## Installing on your phone

- **iOS (Safari):** Share → *Add to Home Screen*. Launches fullscreen with no browser chrome.
- **Android (Chrome):** menu → *Install app* / the install prompt.

Long-pressing the installed icon exposes shortcuts to **New note** and **Whiteboards**.

---

## Tech

| Layer    | Choice                                                    |
| -------- | --------------------------------------------------------- |
| Frontend | React 19, TypeScript, Vite, React Router, lucide-react     |
| Backend  | Node 22, Express 5, better-sqlite3 (WAL)                   |
| Auth     | JWT in an httpOnly cookie, bcrypt password hashing         |
| Images   | multer + sharp — re-encoded to WebP with generated thumbnails |
| Deploy   | Multi-stage Docker image + Compose, named volume for data  |

### Project layout

```
server/src/
  index.js          Express app, static SPA hosting
  db.js             SQLite schema + settings helpers
  auth.js           JWT issue/verify, auth & admin guards
  routes/           auth, notes, boards, files, misc (shares, unfurl, admin, search)
web/src/
  Shell.tsx         App frame, sidebar, global hotkeys
  CommandPalette.tsx
  pages/            Notes, Boards, Board (canvas), Settings, Admin, Shared, Auth
  store.tsx         Auth/session/theme context + toasts
```

## Security notes

- Passwords are bcrypt-hashed; tokens are httpOnly cookies (90-day expiry)
- Every note, board, image and shortcut query is scoped by `user_id` — cross-user access returns 404
- Admin routes are guarded server-side, not just hidden in the UI
- Uploads are restricted to images, capped at 12 MB, and re-encoded through sharp (strips EXIF and any embedded payloads)
- An admin cannot disable, demote or delete their own account by accident
