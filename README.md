<div align="center">

# ◈ Saka-irs

### Visual Search, Image Resemblance & Discovery System

**Saka** *(search — Swahili/Sheng)* + **IRS** *(Image Recognition Software)*

*MVP · Personal Use · v3.0*

</div>

---

## What is Saka-irs?

Saka-irs is an **image-first visual search tool**: instead of typing text to describe an image, the image itself is the query.

```text
IMAGE  →  SEARCH  →  VISUAL RESULTS
```

It answers five increasingly broad questions:

| # | Question | How (MVP) |
|---|----------|-----------|
| 1 | Have I seen this image before? | Local perceptual matching |
| 2 | Is there a modified version of it? | pHash / dHash / aHash fingerprints |
| 3 | Does another image share its features? | Feature matching *(Phase 2)* |
| 4 | Which images visually resemble it? | CLIP embeddings *(Phase 3)* |
| 5 | Where does it exist externally? | Reverse-image / corpus providers *(optional phases)* |

The MVP ships **Phase 1**: index images into your local library, then search that library for exact duplicates, near duplicates, and perceptually similar images. Results are always labeled with **what** was found, **where**, and **why** — evidence, never certainty.

## Features

- **Two explicit flows** — *Add to Library* (`POST /api/images`) and *Search* (`POST /api/search`)
- **Perceptual fingerprinting** — in-house DCT pHash + grid dHash + block aHash, all computed from one normalized pixel buffer
- **Honest classification** — `exact duplicate · near duplicate · visually similar` with Strong / Moderate / Weak confidence buckets
- **Provider architecture** — pluggable search sources behind one contract; runs fully offline with only the local provider enabled
- **Hardened ingestion** — magic-byte validation, decode proof, decompression-bomb cap, UUID filenames, rate limiting, helmet headers
- **Privacy-first metadata** — EXIF is read locally; GPS is stored as a boolean flag only, never coordinates; sanitized re-encodes strip all metadata before anything leaves the machine
- **Retention lifecycle** — MongoDB TTL expiry + a filesystem sweeper so no orphaned files accumulate
- **Graceful degradation** — provider failures never fail a search; per-provider status is exposed in every response
- **Reverse-image pivots without an account** — a metadata-stripped PNG is copied to the clipboard and the engine (Lens · Yandex · TinEye · SauceNAO · trace.moe) opens in a tab; the browser uploads, never this server
- **Offline Forensic Suite** — Interactive Error Level Analysis (ELA), Sensor Noise Inconsistency mapping (PRNU / Laplacian high-pass), and Directional Luminance Gradient analysis
- **Local Auto-Hinting & Content Extraction** — Automatically infers search terms from filenames, EXIF/IPTC metadata captions, and visual color biome distribution without typing
- **Specialized Domain & Geo-OSINT** — Regional origin prediction, environmental climate/biome classification, and optional biological species identification (iNaturalist)

## Tech Stack

MERN-compatible · plain JavaScript everywhere (CommonJS, no build step):

| Layer | Technology |
|-------|------------|
| Backend | Node.js (≥18) + Express.js |
| Database | MongoDB + Mongoose |
| Frontend | EJS shells + Vanilla JavaScript + CSS |
| Imaging | sharp |
| Metadata | exifr |

> The REST/JSON API keeps the presentation layer decoupled — the EJS frontend can be swapped for React later without touching backend code.

---

## Getting Started

### Prerequisites

- **Node.js 18+**
- **MongoDB** running locally on port `27017` ([install guide](https://www.mongodb.com/docs/manual/installation/)) — or point `MONGODB_URI` at any instance

### Install & Run

```bash
# 1. install dependencies
npm install

# 2. create your environment file (defaults work out of the box)
cp .env.example .env      # Windows PowerShell: Copy-Item .env.example .env

# 3. start MongoDB (if not running as a service)
mongod --dbpath ./data

# 4. launch Saka-irs
npm start                 # → http://localhost:3000
```

Storage directories (`storage/uploads`, `normalized/`, `thumbnails/`, `temporary/`) are created automatically on boot.

### Verify the installation

```bash
npm test                        # hashing pipeline smoke tests (no DB needed)
node scripts/boot-test.js       # boots server & probes HTTP layer (no DB needed)
```

### First search

1. Open `http://localhost:3000`
2. Drop an image → click **Add to Library** (repeat with a few images)
3. Drop any image → click **Saka — Search**
4. Results appear grouped into *Exact / Near Duplicates* and *Visual Resemblance*, each card showing provider, method, distance, and confidence badge

---

## API Reference

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET`  | `/` | Main interface (EJS shell) |
| `POST` | `/api/images` | Index an image into the library |
| `GET` | `/api/images/:id` | Public-safe image record |
| `GET`  | `/api/images/:id/thumbnail` | 256px WebP thumbnail |
| `GET`  | `/api/images/:id/pivot.png` | Metadata-stripped PNG for manual reverse-image pivots |
| `GET`  | `/api/pivot/engines` | Pivot engine list (Lens · Yandex · TinEye · SauceNAO · trace.moe) |
| `DELETE` | `/api/images/:id` | Remove record + owned files |
| `POST` | `/api/search` | Run enabled providers against a query image |
| `GET` | `/api/searches` | Recent search history (20) |
| `GET` | `/api/health` | Liveness + enabled providers |

**Index an image:**

```bash
curl -F "image=@photo.jpg" -F "location=Nairobi" http://localhost:3000/api/images
```

**Search with an image:**

```bash
curl -F "image=@query.jpg" http://localhost:3000/api/search
```

**Search response shape (per-provider truth included):**

```json
{
    "durationMs": 342,
    "status": "completed",
    "providers": {
        "local-hash": { "status": "ok", "resultCount": 4 }
    },
    "categories": {
        "duplicates":   [ { "matchType": "near_duplicate", "confidence": "strong", "distance": 2 } ],
        "resemblance":  [],
        "discovery":    []
    }
}
```

## Configuration

All settings live in `.env` (see `.env.example`):

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `3000` | HTTP port |
| `MONGODB_URI` | `mongodb://127.0.0.1:27017/saka-irs` | Database connection |
| `LOCAL_PROVIDER` | `true` | Enable local hash matching |
| `EXTERNAL_CORPUS_PROVIDER` | `true` | Openverse CC/public domain corpus provider (Category A — Free) |
| `WIKIMEDIA_PROVIDER` | `true` | Wikimedia Commons historical/encyclopedic media provider (Category A — Free) |
| `EXTERNAL_REVERSE_PROVIDER` | `false` | Web reverse-image discovery (Category B — Google Vision / TinEye) |
| `GOOGLE_VISION_API_KEY` | `""` | Optional API key for Google Cloud Vision `webDetection` |
| `EXTERNAL_TIMEOUT_MS` | `8000` | Hard timeout per external call |
| `NEAR_DUPLICATE_THRESHOLD` | `6` | pHash/dHash distance ≤ → near duplicate |
| `VISUAL_MATCH_THRESHOLD` | `12` | Distance ≤ → visually similar candidate |
| `RETENTION_DAYS` | `7` | Library image retention |
| `QUERY_RETENTION_HOURS` | `24` | Query-copy retention |
| `MAX_FILE_SIZE_MB` | `15` | Upload size cap |
| `MAX_PIXELS` | `50000000` | Decompression-bomb guard (~50 MP) |
| `TRACEMOE_PROVIDER` | `false` | Automatic trace.moe lookups (anime only, ~100/day) |
| `TRACEMOE_DAILY_LIMIT` | `100` | Local daily budget before the API is asked |
| `SERPAPI_KEY` | `""` | Setting a key enables SerpApi Google Lens lookups (~100/month free) |
| `PUBLIC_BASE_URL` | `""` | HTTPS origin of this app; only used by SerpApi's Yandex engine |
| `EXTERNAL_CACHE_DAYS` | `30` | How long external results are reused (costs no quota) |
| `PIVOT_MAX_DIM` | `1280` | Long edge of the PNG handed to Lens/Yandex/TinEye |

> Thresholds are sensible starting points; calibrate them against your own content using the benchmarking plan in the documentation (§38).

## Project Structure

```text
saka-irs/
├── server.js                 # entry point
├── config/db.js              # Mongo connection (non-fatal boot)
├── models/                   # Mongoose: Image, Search (TTL-indexed)
├── routes/                   # pageRoutes (EJS shells), apiRoutes (REST)
├── controllers/              # imageController, searchController
├── services/                 # Search, Image, Fingerprint, Metadata,
│                             # Result, Storage, Pivot, Quota, ExternalCache
├── providers/                # LocalHash, external corpus, wikimedia,
│                             # tracemoe, serpapi (duck-typed registry)
├── middleware/               # upload, validation, requireDb, errorHandler
├── utils/                    # hashing (DCT pHash/dHash/aHash), hamming,
│                             # ranking, sanitize, sweeper
├── views/                    # layout / index / error (shells only)
├── public/                   # css + vanilla js (app, upload, results,
│                             # pivot, library, history, forensics)
├── scripts/boot-test.js      # HTTP-layer verification
├── tests/smoke.test.js       # fingerprint pipeline tests (node:test)
└── storage/                  # uploads · normalized · thumbnails · temporary
```

## Privacy & Retention

- Originals never leave the machine; only metadata-stripped re-encodes would ever be transmitted (and no external provider is enabled by default).
- The pivot panel transmits nothing at all — the browser uploads the PNG under the user's own session.
- Enabling `TRACEMOE_PROVIDER` or setting `SERPAPI_KEY` *does* send a derivative (no EXIF, no GPS, no colour profile) to that provider. SerpApi also stores a ≤500 KB JPEG on its side; both trades are opt-in.
- GPS presence is a boolean flag — coordinates are never persisted.
- Library images expire after `RETENTION_DAYS`; TTL removes records, the sweeper (every 30 min) removes files.
- Temporary upload staging is cleaned on every request, success or failure.

## Roadmap

- **Phase 1 [Complete]** — local visual history matching *(this repo)*
- **Phase 1.5** — external reverse-image discovery (ToS-compliant API required)
- **Phase 2** — feature matching for crops/partial images (OpenCV ORB/SIFT)
- **Phase 3** — semantic visual search (CLIP embeddings + vector DB)
- **Phase 4** — recognition, only when technically & legally justified

## Search Providers & OSINT Extensibility

Saka-irs runs on a duck-typed provider architecture (`providers/`). Providers execute in parallel under a hard timeout (`Promise.allSettled`), ensuring external delays never crash your local library searches.

### Category A — 100% Free & Zero Key Required (Shipped & Active)
- **Openverse Corpus Provider (`external-corpus`)**: Queries over 700 million openly licensed Creative Commons, museum, and cultural archive images using contextual hints (`keyword`, `location`, `name`) or filename fallback.
- **Wikimedia Commons Provider (`wikimedia-corpus`)**: Queries the official Wikimedia Foundation REST API across millions of historical, encyclopedic, news, and public domain media files. Ships active out of the box with zero API keys required.
- **Geo-OSINT Provider (`geo-osint`)**: Local environmental biome and timezone classifier predicting candidate regions, climate zones, and geographic cues without external network requests.
- **Biological Taxonomy Provider (`inaturalist`)**: Connects to the official open computer vision API of iNaturalist (California Academy of Sciences & NatGeo) for flora, fauna, insect, and fungal taxonomy (opt-in via `INATURALIST_PROVIDER=true`).

### Category A+ — Reverse image (opt-in, metered, no account required for pivots)

- **Pivot panel (no API, no account, no ToS risk)**: Google Lens, Yandex Images, TinEye, SauceNAO and trace.moe have no usable free API (or forbid scripted use). Instead, `GET /api/images/:id/pivot.png` renders an EXIF/GPS-stripped PNG and the client copies it to the clipboard and opens the chosen engine. The upload happens in the user's own browser session — the server never transmits the image.
- **trace.moe (`tracemoe`)**: the only keyless *official* reverse-image API. Content-based retrieval for **anime scenes only** (series, episode, timestamp), so it ships disabled — enable with `TRACEMOE_PROVIDER=true`. Anonymous tier is small (~100 searches/day, concurrency 1), so results are cached by content hash and a local daily counter stops us before the API rate-limits us.
- **SerpApi (`serpapi`)**: Google Lens lookups with a free 100 searches/month key (no credit card). It uploads a metadata-stripped JPEG (≤500 KB) via SerpApi's Image API, so it needs no public hosting — but note that pixels *do* leave the machine when it is enabled. Yandex is attempted only when `PUBLIC_BASE_URL` exposes the app over HTTPS, because that engine accepts a URL rather than an upload.

> Metered providers are opt-in and paired with a persistent content-hash cache (`EXTERNAL_CACHE_DAYS`), so repeat searches of the same image cost no quota.

### Category B — Generous Free Tiers (Requires Free Sign-up Key)
- **Google Cloud Vision API (`google-vision`)**: Template included in `providers/GoogleVisionProvider.js`. Provides true reverse-image web detection (`pagesWithMatchingImages`, partial crops, full web matches). **1,000 free requests per month**. Enable by adding `GOOGLE_VISION_API_KEY` to `.env`.
- **SerpApi (Google Lens / Yandex)**: Scraped search engine proxy with 100 free searches/month for programmatic Google Lens and Yandex visual lookup.
- **Picarta.ai**: AI visual geolocation predicting city, country, and geographic coordinates from visual terrain, architecture, and flora.

### Category C — Self-Hosted / Local AI Sidecars (Zero Cloud Dependency)
- **Local Digital Forensics Suite**: 100% offline image tampering analysis (`utils/forensics.js`) using `sharp`:
  - **Error Level Analysis (ELA)**: Re-compression delta matrix revealing edited or inserted regions.
  - **Sensor Noise Map**: High-pass Laplacian convolution isolating sensor grain (PRNU) to expose airbrushed or cloned areas.
  - **Luminance Gradient**: Sobel directional lighting operators highlighting conflicting illumination vectors.
- **Local Auto-Hinting Engine (`services/AutoHintService.js`)**: Intelligent filename tokenization, IPTC/EXIF caption harvesting, and dominant color biome detection.
- **Local ONNX / Transformers CLIP Embeddings (Phase 3)**: CPU/GPU local vector embeddings for semantic concept matching without external network calls.

### OSINT Tradecraft & Reference Knowledge Base
For investigative workflows, multi-engine reverse pivots, and forensic tradecraft, Saka-irs references and aligns with the curated community directory:
- **[The-Osint-Toolbox / Image-Research-OSINT](https://github.com/The-Osint-Toolbox/Image-Research-OSINT)** — An extensive living library of image OSINT tools covering reverse search engines, AI geolocation, facial intelligence, and forensic verification.
- **OPSEC Advantage:** While cloud OSINT tools risk exposing sensitive queries or training external models, Saka-irs processes searches locally first and strictly strips EXIF and GPS coordinates before any external provider dispatch.

### Browser Extension Companion (Harvesting & Ingestion)

While the Pivot panel allows users to manually reverse-search external engines without sharing credentials, saving discovered external matches directly into your local database requires an ingestion seam. 

A companion Web Extension (Manifest V3) solves this problem cleanly without headless scraping overhead:
- **Direct Database Ingestion**: One-click right-click context menu ("Send to Saka-irs") that transfers images found on Google Lens, Yandex, Pinterest, or news sites straight into your local MongoDB library via `POST /api/images`.
- **Zero Bot Detection or CAPTCHAs**: Because queries happen in your active browser session, you avoid anti-bot gates, rate-limit bans, and Proof-of-Work challenges completely.
- **Zero Proxy or VPN Requirements**: Operates over your legitimate human residential connection without paying for rotating proxy pools.
- **Universal Capture**: Captures full-resolution images from any website's DOM cache rather than relying on brittle site-specific scrapers.

## Documentation

Full architecture, flows, data models, security policy, and legal boundaries:
[`documentation/saka-irs_documentation.md`](documentation/saka-irs_documentation.md)

## Legal Note

Saka-irs distinguishes *publicly searchable* from *permitted to automatically access*. It does not bypass authentication or anti-bot mechanisms, is not a facial-recognition or person-identification system, and external providers are adopted only when licensing and terms permit.

---

<div align="center">

*Evidence, not certainty.*

Saka-irs · 2026

</div>

