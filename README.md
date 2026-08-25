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

- 🖼️ **Two explicit flows** — *Add to Library* (`POST /api/images`) and *Search* (`POST /api/search`)
- 🔎 **Perceptual fingerprinting** — in-house DCT pHash + grid dHash + block aHash, all computed from one normalized pixel buffer
- 🏷️ **Honest classification** — `exact duplicate · near duplicate · visually similar` with Strong / Moderate / Weak confidence buckets
- 🧩 **Provider architecture** — pluggable search sources behind one contract; runs fully offline with only the local provider enabled
- 🛡️ **Hardened ingestion** — magic-byte validation, decode proof, decompression-bomb cap, UUID filenames, rate limiting, helmet headers
- 🔐 **Privacy-first metadata** — EXIF is read locally; GPS is stored as a boolean flag only, never coordinates; sanitized re-encodes strip all metadata before anything leaves the machine
- ⏳ **Retention lifecycle** — MongoDB TTL expiry + a filesystem sweeper so no orphaned files accumulate
- 📉 **Graceful degradation** — provider failures never fail a search; per-provider status is exposed in every response

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
| `GET` | `/api/images/:id/thumbnail` | 256px WebP thumbnail |
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
| `EXTERNAL_REVERSE_PROVIDER` | `false` | Reverse-image provider *(Phase 1.5)* |
| `EXTERNAL_CORPUS_PROVIDER` | `false` | Corpus provider — hint-driven *(optional)* |
| `EXTERNAL_TIMEOUT_MS` | `8000` | Hard timeout per external call |
| `NEAR_DUPLICATE_THRESHOLD` | `6` | pHash/dHash distance ≤ → near duplicate |
| `VISUAL_MATCH_THRESHOLD` | `12` | Distance ≤ → visually similar candidate |
| `RETENTION_DAYS` | `7` | Library image retention |
| `QUERY_RETENTION_HOURS` | `24` | Query-copy retention |
| `MAX_FILE_SIZE_MB` | `15` | Upload size cap |
| `MAX_PIXELS` | `50000000` | Decompression-bomb guard (~50 MP) |

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
│                             # Result, Storage — business core
├── providers/                # LocalHashProvider + duck-typed registry
├── middleware/               # upload, validation, requireDb, errorHandler
├── utils/                    # hashing (DCT pHash/dHash/aHash), hamming,
│                             # ranking, sanitize, sweeper
├── views/                    # layout / index / error (shells only)
├── public/                   # css + vanilla js (app, upload, results)
├── scripts/boot-test.js      # HTTP-layer verification
├── tests/smoke.test.js       # fingerprint pipeline tests (node:test)
└── storage/                  # uploads · normalized · thumbnails · temporary
```

## Privacy & Retention

- Originals never leave the machine; only metadata-stripped re-encodes would ever be transmitted (and no external provider is enabled by default).
- GPS presence is a boolean flag — coordinates are never persisted.
- Library images expire after `RETENTION_DAYS`; TTL removes records, the sweeper (every 30 min) removes files.
- Temporary upload staging is cleaned on every request, success or failure.

## Roadmap

- **Phase 1 ✅** — local visual history matching *(this repo)*
- **Phase 1.5** — external reverse-image discovery (ToS-compliant API required)
- **Phase 2** — feature matching for crops/partial images (OpenCV ORB/SIFT)
- **Phase 3** — semantic visual search (CLIP embeddings + vector DB)
- **Phase 4** — recognition, only when technically & legally justified

## Documentation

Full architecture, flows, data models, security policy, and legal boundaries:
[`documentation/saka-irs_documentation.md`](documentation/saka-irs_documentation.md)

## Legal Note

Saka-irs distinguishes *publicly searchable* from *permitted to automatically access*. It does not bypass authentication or anti-bot mechanisms, is not a facial-recognition or person-identification system, and external providers are adopted only when licensing and terms permit.

---

<div align="center">

*Evidence, not certainty.*

</div>

