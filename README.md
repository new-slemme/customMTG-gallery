# Custom MTG Gallery

Dockerized Next.js app that scans `/sets`, displays card galleries, and stores per-card feedback in SQLite.

## Features
- Runtime scan of `SETS_DIR` (default `/app/sets`) with each immediate subfolder treated as a set.
- Loads all `*.json` files in each set's `cards_json/` folder.
- Supports JSON formats:
  - array of cards
  - object with `cards` array
- Image resolution strategy:
  1. `cards_images/<Card Name>.png`
  2. `cards_images/<slugified-card-name>.png`
  3. fallback placeholder image
- Card modal with zoom and readable rules lines.
- Per-card comment thread with optional name/rating and required comment.
- Feedback export endpoint.
- Optional shared password gate via `GALLERY_PASSWORD`.
- In-memory set/card cache with 15s refresh TTL and last-known-good fallback on scan errors.

## Required data layout
```text
sets/
  digiMTG/
    cards_images/
      Cardname.png
    cards_json/
      Cardlist.json
```

## API endpoints
- `GET /api/sets`
- `GET /api/sets/[set_slug]/cards`
- `GET /api/sets/[set_slug]/cards/[card_id]`
- `GET /api/feedback?set=...&card_id=...`
- `POST /api/feedback`
- `GET /api/feedback/export`
- `POST /api/login` (used only when password gate enabled)
- `GET /sets/<set_slug>/cards_images/<file>.png` (safe static file route)

## Local development
```bash
npm install
npm run dev
```
Then open `http://localhost:3000`.

Optional env vars:
- `SETS_DIR` (default `./sets`)
- `DATA_DIR` (default `./data`)
- `GALLERY_PASSWORD` (if set, users must enter password once)

## Docker
Build and run:
```bash
docker compose up -d --build
```

Compose mounts:
- `./sets:/app/sets:ro`
- `./data:/app/data`

Container runs on `0.0.0.0:3000` and joins external `npm_default` network.

## Manual test checklist
Using sample `sets/digiMTG/...`:
1. Home page shows `digiMTG`.
2. Set page lists cards from JSON.
3. Cards with matching `Cardname.png` render actual images.
4. Cards without images show placeholder.
5. Clicking card opens modal with readable rules text lines.
6. Posting feedback appears immediately and persists after container restart.
7. `docker compose up` succeeds with external `npm_default` network present.
