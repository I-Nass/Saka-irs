# Saka-irs — Official Documentation

> ### Visual Search, Image Resemblance & Discovery System
> *Documentation Version 3.0 — incorporates the v3.0 concrete technical fixes*

---

## Document Control

| Field | Value |
| --- | --- |
| **Project name** | Saka-irs |
| **Version** | 3.0 |
| **Status** | MVP / Personal Use |
| **Architecture** | MERN-compatible |
| **Backend** | Node.js + Express.js — written entirely in plain (vanilla) JavaScript |
| **Database** | MongoDB |
| **Frontend** | EJS templates + Vanilla JavaScript + CSS (no frontend framework in the MVP) |
| **Primary input** | Image |
| **Primary output** | Visual matches, resemblance candidates, and discovery results |
| **Search architecture** | Provider-based |
| **Image storage** | Local filesystem (MVP) |

Sections marked **[UPDATE]** record concrete technical decisions adopted during the v3.0 review. They are binding implementation guidance, not optional suggestions.

---

# 1. Project Identity

## 1.1 Name

The official name of the project is:

> **Saka-irs**

The name combines:

- **Saka** — search, in Swahili/Sheng usage.
- **IRS** — Image Recognition Software.

Therefore:

> **Saka-irs is an Image Recognition Software project centered around searching, matching, discovering, and eventually understanding images.**

The current MVP deliberately implements a narrower subset of that broader vision.

---

# 2. What Saka-irs Is

The current Saka-irs MVP is:

> **A visual search, image resemblance, and image discovery tool.**

The system allows an image to become the primary search input. Instead of requiring the user to describe an image with text, Saka-irs begins with:

```text
IMAGE
  ↓
SEARCH
  ↓
VISUAL RESULTS
```

Saka-irs is:

- a visual search system
- an image resemblance engine
- an image-history matcher
- a reverse-image discovery interface (optional phase)
- a multi-provider result aggregator
- an experimental image-recognition foundation

---

# 3. What Saka-irs Is Not

The MVP is not:

- a facial recognition system
- an identity verification system
- a person-identification service
- a social-media surveillance system
- a general AI vision assistant
- a web crawler
- a search-engine replacement
- a system for bypassing authentication
- a system for bypassing anti-bot mechanisms
- a system for accessing private content
- a custom-trained neural network platform

These exclusions are deliberate scope and ethics boundaries, not temporary limitations.

---

# 4. Core Product Questions

Saka-irs answers several increasingly broad questions. Each question maps to a different capability/provider:

| # | Question | Handled by |
| --- | --- | --- |
| 1 | Have I seen this image before? | Local perceptual matching |
| 2 | Is there a modified version of this image? | Perceptual hashing (+ feature matching later) |
| 3 | Does another image share similar visual features? | Feature-based matching (later phase) |
| 4 | What other images visually resemble this one? | Semantic similarity (later phase) |
| 5 | Where does this image exist externally? | Reverse-image / corpus providers (optional phases) |

These questions are related but not identical, which is why Saka-irs treats them as distinct **providers** behind one search contract.

---

# 5. Product Philosophy

1. **Image First** — the image is the primary search input.
2. **Resemblance Before Recognition** — establish similarity and discovery before semantic recognition.
3. **Multiple Sources** — no single provider is assumed sufficient.
4. **Evidence, Not Certainty** — a match indicates evidence of visual similarity, never identity.
5. **Provider Independence** — local databases, external APIs, corpora, and future AI models are interchangeable providers.
6. **Minimal Infrastructure** — only infrastructure that provides measurable value.

---

# 6. Technology Stack

## 6.1 MERN-Compatible Architecture

Saka-irs uses a **MERN-compatible** architecture: MongoDB, Express.js, and Node.js form the backend, and the application exposes pure REST JSON APIs so the presentation layer stays fully decoupled. The MVP ships with an **EJS + Vanilla JavaScript** frontend; because every data interaction happens through `fetch()` against JSON endpoints, the EJS layer can later be replaced by a React client **without touching any backend code**. That substitution path is what makes the stack MERN-compatible rather than merely "Node + Mongo".

## 6.2 Plain JavaScript Everywhere

All project code — server, services, providers, middleware, utilities, and browser scripts — is **plain (vanilla) JavaScript**:

- CommonJS modules (`require` / `module.exports`)
- No TypeScript, no transpilation, no bundler, no build step
- No frontend framework; browser scripts are plain JS served statically by Express

## 6.3 Confirmed Dependencies

| Package | Role |
| --- | --- |
| `express` | HTTP server and routing |
| `mongoose` | MongoDB ODM (models, indexes, TTL) |
| `ejs` | Server-rendered page shells (layout/index/error) |
| `multer` | Multipart upload handling into `storage/temporary/` |
| `sharp` | Decode, normalize, sanitize re-encode, thumbnails |
| in-house DCT hashing (`utils/hashing.js`) | 64-bit pHash/dHash/aHash computed on one shared raw buffer (R6) |
| `file-type` | Magic-byte content sniffing (never trust client MIME) |
| `exifr` | Safe EXIF/metadata extraction (GPS-aware) |
| `dotenv` | Environment configuration |
| `express-rate-limit`, `helmet` | Baseline hardening |

**[UPDATE]** `sharp-phash` + hand-rolled dHash/aHash replace any heavier hashing stack: all three fingerprints derive from **one normalized pixel buffer**, guaranteeing hash comparability across the library.

---

# 7. System Architecture Overview

```text
                         ┌───────────────┐
                         │    SAKA-IRS   │
                         └───────┬───────┘
                                 │
                                 ▼
                         ┌───────────────┐
                         │ SearchService │
                         └───────┬───────┘
                                 │
          ┌──────────────────────┼──────────────────────┐
          │                      │                      │
          ▼                      ▼                      ▼
 ┌────────────────┐    ┌──────────────────┐    ┌─────────────────┐
 │ Local Provider │    │ External Search  │    │ Semantic Search │
 │ pHash/dHash/   │    │ Reverse image    │    │ OpenCLIP        │
 │ aHash/MongoDB  │    │ search           │    │ Qdrant/FAISS    │
 └───────┬────────┘    └────────┬─────────┘    └────────┬────────┘
         │                      │                       │
         └──────────────────────┼───────────────────────┘
                                ▼
                    Result Pipeline (Normalize → Deduplicate → Rank)
                                ▼
                       EJS + Vanilla JS Frontend
```

The core application never needs to understand the internal mechanics of any provider.

---

# 8. Search Provider Contract

**[UPDATE]** Providers use a **convention contract (duck typing)**, not class inheritance. A valid provider is any plain-JS module exporting this shape:

```javascript
// providers/LocalHashProvider.js — plain JS, CommonJS
module.exports = {
    name: 'local-hash',
    sourceType: 'local',
    matchMethod: 'perceptual_hash',

    isEnabled() {
        return process.env.LOCAL_PROVIDER === 'true';
    },

    async search(input) {
        // input: { hashes, normalizedPath, hints }
        // returns RAW results only — ResultService owns the pipeline
        return [];
    }
};
```

`SearchService` duck-types whatever satisfies this contract and registers it. Adding a provider never modifies existing code.

---

# 9. Provider Categories

## 9.1 Local Provider

Searches images already indexed by Saka-irs (`LocalHashProvider`).

Mechanism: pHash / dHash / aHash → Hamming distance → MongoDB → candidate classification.

## 9.2 Reverse-Image Provider

Sends a **sanitized** image representation to an external reverse-image service.

> **[UPDATE] External landscape reality check:** the Bing Visual Search APIs were retired (2025) and Google Lens offers no official API. The remaining *legitimate* option is a paid, ToS-compliant API such as **TinEye**. SERP-scraping wrappers exist but sit in tension with Saka-irs's own legal boundaries (Section 42). Phase 1.5 therefore assumes TinEye-style API access or is deferred.

## 9.3 External Image Corpus Provider

Searches an identifiable external collection (Wikimedia Commons, Openverse, Internet Archive).

> **[UPDATE] Critical dependency:** these public APIs are **text-search only — none offer free reverse-image lookup**. An MVP corpus provider can therefore only be driven by **contextual hints** (Section 28): without text there is no query, and without embeddings (Phase 3) there is no visual query. Corpus search is labeled *hint-driven* until the semantic phase, or deferred entirely.

Corpus results are always labeled **External Corpus**, never automatically **Web Discovery**.

## 9.4 Semantic Provider (Future)

```text
Image → CLIP/OpenCLIP → Embedding → Vector DB (Qdrant/FAISS) → Nearest visual neighbors
```

pHash asks *"does this resemble this file?"*; embedding search asks *"which images occupy a similar visual/semantic region?"* Introduced only after the baseline MVP has been benchmarked.

---

# 10. Two Primary Operations: Index vs Search

**[UPDATE]** The original spec implied but never separated ingestion from querying. On day one an empty library would make every search return nothing. Saka-irs therefore defines **two explicit operations**:

| | **Index** (Add to Library) | **Search** |
| --- | --- | --- |
| Endpoint | `POST /api/images` | `POST /api/search` |
| Purpose | Ingest into local history | Query against indexed history |
| Pipeline | Validate → normalize → fingerprint → thumbnail → persist | Fingerprint query → run providers → aggregate |
| Retention | Persists until deleted / retention expiry | Query copy is temporary by policy |
| UI control | "Add to Library" button | "Search" button |

Both flows share the Validation, Normalization, and Fingerprint services. After a search, Saka-irs may offer *"also add this image to your library"* as a follow-up action.

---

# 11. Complete Search Flow

```text
                    USER
                     │
              Select Image
                     │
              Image Upload
                     │
                 Validation
                     │
                Normalization
                     │
              Fingerprint Image
          ┌──────────┼───────────┐
          ▼          ▼           ▼
       Local      External    Semantic
       Search     Search      Search    ← Promise.allSettled()  [UPDATE]
          │          │           │
          └──────────┼───────────┘
                     ▼
               Result Collector
                     ▼
       Normalize → Deduplicate → Rank → Classify
                     ▼
              Present Results
```

Not every search executes every provider — providers are configuration-driven and independently optional.

---

# 12. Indexing Flow

```text
Select Image → Upload → Validate → Normalize → Fingerprint
     → Generate Thumbnail (256px WebP)          [UPDATE]
     → Persist Image record + files
     → Confirm to user
```

---

# 13. Image Validation Flow

```text
Upload
  ↓ Is file present?
  ↓ Is size ≤ MAX_FILE_SIZE?
  ↓ Does extension match detected content?
  ↓ Do MAGIC BYTES match an allowed type?        [UPDATE]
  ↓ Can sharp actually decode the file?
  ↓ Are dimensions within the pixel budget?      [UPDATE]
  ↓ PASS → move out of temporary/
```

**[UPDATE] Concrete rules:**

1. Content type is decided by **magic bytes via `file-type`**, never by client-supplied `Content-Type` or filename.
2. Decodability is proven with a real `sharp().metadata()` read before anything is persisted.
3. Input is capped at ~50 megapixels (**decompression-bomb protection**) — reject early, before decode buffers allocate.
4. Original filenames are never trusted or reused; stored files receive UUID names.
5. Any failure returns a specific, useful error and leaves nothing behind in `storage/temporary/`.

---

# 14. Normalization Flow & Hash-Stability Rules

```text
Original Image
      ↓ Decode (sharp)
      ↓ Read dimensions
      ↓ Correct orientation          ← .rotate() auto-orients via EXIF
      ↓ Flatten alpha onto white     ← transparent PNGs otherwise hash unstably
      ↓ Grayscale
      ↓ Resize 32×32 (lanczos)
      ↓ Extract raw pixel buffer
      → normalized working image
```

**[UPDATE]** Hash repeatability is won or lost here. The following rules are mandatory and centralized in one code path — **fingerprints are never computed from the original file**:

| Rule | Detail |
| --- | --- |
| R1 | Always hash the **normalized derivative**, never the original upload. |
| R2 | **EXIF orientation correction first** (`sharp.rotate()` with no args). Skipping this makes phone photos hash differently every time. |
| R3 | **Flatten alpha** onto a fixed background before hashing. |
| R4 | Fixed resize target: **32×32 grayscale** feeding DCT pHash; **9×8** for dHash. |
| R5 | Same resize kernel everywhere (sharp's default lanczos). |
| R6 | One shared pixel buffer feeds all three hashes so results stay comparable. |

---

# 15. Fingerprint Generation

```text
Normalized Image (32×32 grayscale raw buffer)
       ├──────→ pHash   (in-house 2D DCT-II, 8×8 block)  — strongest structural signal
       ├──────→ dHash   (hand-rolled, 9×8 gradient) — fast, robust
       └──────→ aHash   (hand-rolled, mean threshold) — weakest, stored but low-weighted
```

dHash/aHash are each ~20 lines of plain JS over the same buffer. All hashes are stored as **fixed-length hex strings** (16 chars for 64-bit).

> **[UPDATE] Weighting:** aHash discards contrast/structure and is markedly weaker than pHash/dHash. It is stored for completeness but ranked lowest; dHash is arguably the best speed-vs-robustness trade-off. aHash votes must never inflate a match on their own.

---

# 16. Hamming Distance & Local Matching

```text
Query hashes
     ↓ Load candidate hashes from MongoDB
     ↓ XOR + popcount per pair (BigInt or Buffer)
     ↓ Apply benchmarked thresholds
     ↓ Generate candidates → classify → return
```

Example classification (starting points — real thresholds come from Section 38):

```text
Candidate A — pHash distance: 2   → Near duplicate
Candidate B — pHash distance: 8   → Possible visual match
Candidate C — pHash distance: 25  → Reject
```

---

# 17. Local Provider Scale Ceiling

**[UPDATE]** MongoDB cannot compute Hamming distance natively over stored hex strings, so `LocalHashProvider` loads candidate hashes into Node and compares in memory:

| Indexed images | Expected behavior |
| --- | --- |
| ≤ ~50,000 | Comfortable — tens of milliseconds per search |
| ~100,000+ | Hundreds of ms; memory pressure begins |

The documented future path is **multi-index hashing or a BK-tree** — deliberately *not* built now (Philosophy §5.6). This ceiling is recorded so growth beyond it triggers a planned, not panicked, response.

---

# 18. Feature Matching (Future — Phase 2)

```text
Query → Feature detection (ORB/SIFT/AKAZE via OpenCV)
      → Feature descriptors
      → Compare against candidate images
      → Geometric verification
      → Candidate score
```

Useful when the query is cropped, rotated, partially visible, or embedded in another image — cases where perceptual hashes break down.

---

# 19. Semantic Search (Future — Phase 3)

```text
Query Image → OpenCLIP → Embedding Vector
            → Vector Search (Qdrant/FAISS)
            → Nearest neighbors → Visual resemblance results
```

Fundamentally different from pHash: pHash asks *"does this image resemble this file?"*; embeddings ask *"which images occupy a similar visual/semantic region?"* — e.g. a different Land Cruiser, different angle, similar scene.

---

# 20. External Reverse-Image Flow

```text
Query Image
     ↓ Create sanitized copy
     ↓ Provider Adapter (isolated from core)
     ↓ External API   ← hard timeout via AbortController [UPDATE]
     ↓ Provider Results
     ↓ Normalize → Saka-irs Result Pipeline
```

**[UPDATE] Sanitization is nearly free:** re-encoding through `sharp` **strips all EXIF (including GPS) by default** — unless `.withMetadata()` is called. The sanitized copy is therefore defined as *"a sharp re-encode without `.withMetadata()`"*. This rule is documented explicitly so nobody reintroduces metadata later.

**[UPDATE] Timeouts are non-negotiable in a synchronous MVP:** one hanging external provider would freeze the entire request. Every outbound call carries a hard deadline (default 8s, configurable).

The original image is never sent externally — only the sanitized derivative.

---

# 21. External Corpus Flow

```text
Hints (location / keywords / organization)
     ↓ Construct provider-specific text query     [UPDATE]
     ↓ External corpus API (Openverse / Wikimedia)
     ↓ Results
     ↓ Normalize → Rank
```

**[UPDATE]** Because corpus APIs are text-only (Section 9.3), this flow is **hint-driven by design** in the MVP. If no hints are supplied, the corpus provider reports `status: "skipped"` rather than guessing. Results carry the label **External Corpus**, and the provider may be disabled entirely until the semantic phase makes true visual corpus matching possible.

---

# 22. Result Aggregation

Providers execute concurrently with **`Promise.allSettled()`** — the literal implementation of failure resilience:

```text
Local provider    → fulfilled   → results kept
External provider → rejected    → error recorded
Semantic provider → rejected    → error recorded
                  ↓
Local results survive. Failures are reported per-provider.
```

A provider failing never fails the search. The response exposes exactly what happened (Section 34).

---

# 23. Deduplication

The same image may surface through multiple providers. Results sharing a URL merge into one entry with combined evidence:

```javascript
{
    url: "https://example.com/image.jpg",
    foundVia: ["reverse_image", "external_corpus"]
}
```

**[UPDATE] URLs are normalized before comparison**, otherwise `example.com/image.jpg?v=2` and `example.com/image.jpg` fail to merge:

1. strip query string and fragment;
2. lowercase scheme and host;
3. remove trailing slash on the path.

True *visual* dedup of external results (downloading thumbnails and hashing them) is acknowledged as a future option but deferred — bandwidth cost is not justified at MVP scale.

---

# 24. Ranking

Ranking combines perceptual distance, feature similarity, embedding similarity, provider relevance, and source confidence — **but every score stays attributable to its method**.

**[UPDATE] Concrete ranking policy:**

1. Ranking happens **within each provider** — never across providers on one universal scale.
2. Each result maps to a bucketed confidence label instead of a fake cross-provider percentage:
   - **Strong** — e.g. pHash distance ≤ near-duplicate threshold
   - **Moderate** — within visual-match band
   - **Weak** — borderline, shown with caution framing
3. Cross-provider ordering stays grouped by category (Section 26), preserving honesty: a local pHash distance and an external relevance score are never presented as the same unit.

---

# 25. Search Result Object

A normalized result:

```javascript
{
    id,                 // provider-internal id
    imageUrl,           // display URL (local route or external)
    thumbnailUrl,

    sourceType,         // local | web_discovery | external_corpus | semantic
    provider,           // saka-irs | tineye | wikimedia | openclip ...

    matchMethod,        // perceptual_hash | reverse_image | corpus_search | embedding_similarity
    matchType,          // exact_duplicate | near_duplicate | feature_match |
                        // visually_similar | visual_resemblance | web_discovery | corpus_match

    confidence,         // strong | moderate | weak        [UPDATE]
    distance,           // e.g. Hamming distance (method-specific)

    title,
    metadata,
    foundVia: [],       // merged providers when deduplicated
    foundAt
}
```

Not every provider populates every field. `confidence` labels replace universal percentages.

---

# 26. Result Presentation

The UI divides results into meaningful categories rather than one generic list:

```text
SEARCH RESULTS

━━━━━━━━━━━━━━━━━━━━━━━━━━━
EXACT / NEAR DUPLICATES
━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Image]  Near duplicate · Local History · pHash distance: low

━━━━━━━━━━━━━━━━━━━━━━━━━━━
VISUAL RESEMBLANCE
━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Image]  Visually similar · Semantic Provider

━━━━━━━━━━━━━━━━━━━━━━━━━━━
WEB DISCOVERY / EXTERNAL CORPUS
━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Image]  External occurrence · Reverse-image provider
```

Every answer states three things: **what** was found, **where** it was found, and **why** it was considered relevant.

---

# 27. Search History

```javascript
{
    queryImageId,
    providersUsed: [],           // with per-provider status
    hints: { name, location, username, organization },
    resultCount,
    durationMs,
    status,                      // completed | partial | failed
    createdAt                    // TTL-indexed for lightweight expiry [UPDATE]
}
```

Lets the user review previous searches without a full multi-user history system.

---

# 28. Contextual Hints

Hints are **context**, never a replacement for visual search:

```text
Name · Location · Username · Organization · Keyword
```

> **[UPDATE] Elevated role:** since public corpus APIs are text-only (Section 9.3), hints are the **query driver for corpus providers**. The hints UI is therefore a first-class form control on the search page, not an afterthought — it is what makes external corpus search possible at all before Phase 3.

---

# 29. Metadata Flow

```text
Image → exifr extraction → Private metadata record
```

Captured: file format, width, height, EXIF presence, timestamp, camera model, GPS presence.

Sensitive values are recorded but **not exposed by default**; the UI shows presence indicators (`hasGps: true`) with explicit opt-in to view details.

---

# 30. Privacy & Sanitization

```text
Original
   ├── Local processing only
   └── Sanitized copy = sharp re-encode WITHOUT .withMetadata()   [UPDATE]
                ↓
        External provider (EXIF/GPS stripped)
```

1. GPS receives particular attention; its presence is always flagged internally.
2. Originals are never transmitted externally — only sanitized derivatives.
3. Temporary query copies are deleted per retention policy (Section 32).
4. Metadata is displayed locally only, behind an explicit action.

---

# 31. Data Models (MongoDB / Mongoose)

## Image Model

```javascript
{
    originalName,                  // display only — never used for storage paths
    storagePath,                   // storage/uploads/<uuid>.<ext>
    normalizedPath,                // storage/normalized/<uuid>.webp     [UPDATE]
    thumbnailPath,                 // 256px WebP generated at ingest      [UPDATE]

    mimeType,                      // detected via magic bytes            [UPDATE]
    size,

    width, height,

    hashes: { phash, dhash, ahash },   // fixed-length hex strings

    metadata: {
        hasExif, createdAt: Date, cameraModel, hasGps
    },

    createdAt,
    expiresAt                      // TTL-indexed                          [UPDATE]
}
```

**[UPDATE] Indexes:** plain index on `hashes.phash` (future optimization headroom); **TTL index on `expiresAt`** drives record expiry automatically.

## Search Model

```javascript
{
    queryImageId,
    providersUsed: [{ name, status, resultCount, durationMs, error }],
    hints: { name, location, username, organization },
    resultCount,
    durationMs,
    status,                        // completed | partial | failed
    createdAt
}
```

---

# 32. Storage & Retention

```text
Upload → Indexed → Searched → Retained N days (default configurable) → Deleted
```

**[UPDATE] Orphaned-files fix:** MongoDB TTL indexes delete **documents only — never files**. Without extra work, `storage/` would silently accumulate orphans. Therefore:

1. TTL index on `Image.expiresAt` handles record cleanup;
2. a lightweight **retention sweeper** (`utils/sweeper.js`, `setInterval` in dev / node-cron later) periodically walks `storage/` and deletes files whose records are gone or past expiry;
3. `StorageService` remains the **only** component that touches filesystem paths, keeping the sweeper testable and future cloud-storage swaps painless (`S3`/`R2`/`B2` later).

---

# 33. Security Requirements

- upload validation (magic bytes + real decode proof)
- file-size limits **and pixel-dimension caps** (decompression bombs) — [UPDATE]
- safe filenames (UUID; original names never touch disk) — [UPDATE]
- path traversal protection
- temporary-file cleanup on every failure path
- metadata sanitization before any external transmission
- API input validation; JSON-only error responses
- rate limiting (`express-rate-limit`) even for personal use — [UPDATE]
- baseline headers via `helmet` — [UPDATE]
- controlled storage access; uploads served through routes when privacy demands it
- authentication before any public deployment

---

# 34. API Design

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/` | Main search/index page (EJS shell) |
| POST | `/api/images` | Index an image into the local library |
| GET | `/api/images/:id` | Image record + metadata |
| GET | `/api/images/:id/thumbnail` | Serve 256px WebP thumbnail |
| DELETE | `/api/images/:id` | Remove image + files from library |
| POST | `/api/search` | Run a provider-based visual search |
| GET | `/api/searches` | Recent search history |

**[UPDATE] Search response exposes per-provider status** — the machine-readable form of the resilience rule:

```json
{
    "searchId": "665f1c...",
    "durationMs": 342,
    "providers": {
        "local":    { "status": "ok",      "resultCount": 4, "durationMs": 31 },
        "external": { "status": "failed",  "error": "timeout after 8000ms" },
        "corpus":   { "status": "skipped", "reason": "no hints supplied" }
    },
    "results": [
        {
            "sourceType": "local",
            "provider": "saka-irs",
            "matchMethod": "perceptual_hash",
            "matchType": "near_duplicate",
            "confidence": "strong",
            "distance": 2
        }
    ]
}
```

The frontend renders exactly this truth: *"Local results available. External discovery unavailable."*

---

# 35. Frontend Architecture

```text
EJS page shells (layout.ejs · index.ejs · error.ejs)
        ↓ static vanilla JS
public/js/app.js       → wiring & state
public/js/upload.js    → file select, preview, POST
public/js/results.js   → render grouped results from JSON
```

**[UPDATE] EJS is used for shells only** (`layout`, `index`, `error`). There is **no `results.ejs`** — results are rendered client-side by `results.js` from the JSON API, keeping the React-swap path clean (Section 6.1). No framework, no bundler: upload handling, previews, loading states, filtering, and inspection all stay in plain JS.

---

# 36. Project Structure

```text
saka-irs/
├── server.js
├── package.json
├── .env / .gitignore
├── config/db.js
├── models/Image.js · Search.js
├── routes/pageRoutes.js · apiRoutes.js
├── controllers/imageController.js · searchController.js
├── services/
│   ├── SearchService.js        # orchestrates providers (allSettled)
│   ├── ImageService.js         # index/search pipelines
│   ├── FingerprintService.js   # pHash/dHash/aHash from one buffer
│   ├── MetadataService.js      # exifr extraction
│   ├── ResultService.js        # normalize/dedupe/rank/classify
│   └── StorageService.js       # sole filesystem owner
├── providers/
│   ├── LocalHashProvider.js
│   ├── ExternalReverseProvider.js   (Phase 1.5)
│   ├── ExternalCorpusProvider.js    (optional, hint-driven)
│   └── SemanticProvider.js          (Phase 3)
├── middleware/upload.js · validation.js · errorHandler.js
├── utils/hashing.js · hamming.js · sanitize.js · ranking.js · sweeper.js [UPDATE]
├── views/layout.ejs · index.ejs · error.ejs                              [UPDATE]
├── public/css/style.css
├── public/js/app.js · upload.js · results.js
└── storage/uploads/ · normalized/ · thumbnails/ · temporary/
```

---

# 37. Configuration (.env)

```text
# Server
PORT=3000
NODE_ENV=development

# Database
MONGODB_URI=mongodb://127.0.0.1:27017/saka-irs

# Providers (Saka-irs runs fully local with everything else off)
LOCAL_PROVIDER=true
EXTERNAL_REVERSE_PROVIDER=false
EXTERNAL_CORPUS_PROVIDER=false
SEMANTIC_PROVIDER=false

# External provider behavior
EXTERNAL_TIMEOUT_MS=8000          # hard deadline per external call [UPDATE]

# Matching thresholds (defaults pending Section 38 benchmarks) [UPDATE]
NEAR_DUPLICATE_THRESHOLD=6
VISUAL_MATCH_THRESHOLD=12

# Retention & limits
RETENTION_DAYS=7                  # configurable: 7 or 30 typical
MAX_FILE_SIZE_MB=15
MAX_PIXELS=50000000               # decompression-bomb guard [UPDATE]
```

---

# 38. Benchmarking Plan

Before expanding architecture, a test dataset is generated **programmatically with sharp itself** [UPDATE]:

```text
100–500 source images → per source:
Original · Resized · Compressed · Cropped · Rotated · Filtered · Screenshot · Re-encoded · Unrelated
```

Measured per variant: true positives, false positives, false negatives, Hamming distances, response time, provider agreement.

**[UPDATE] Procedure:** run every pair through `FingerprintService` + `LocalHashProvider`, record distance distributions for same-image vs different-image variants, then pick thresholds at the separation point (target: ~zero false positives on unrelated pairs). The resulting numbers replace the defaults in `.env`. This dataset becomes the project's permanent regression harness.

---

# 39. Testing Plan (node:test)

**[UPDATE]** Tests use Node's built-in `node:test` runner — zero extra dependencies, consistent with the plain-JS philosophy.

- **Upload:** valid image · invalid file · oversized file · corrupt file · pixel-bomb
- **Matching:** exact duplicate · resized · compressed · edited · unrelated
- **Providers:** local works offline · external failure preserves local results · results normalize correctly
- **Privacy:** GPS never transmitted externally · temporary files deleted · retention sweeper removes orphans
- **Normalization:** EXIF-rotated phone photo produces stable hashes across re-uploads

---

# 40. Performance Strategy

The MVP intentionally uses synchronous search:

```text
POST /api/search → process → respond
```

Background jobs are introduced only if measurements justify them:

```text
POST /api/search → create Search Job → worker → providers
                 → persist results → frontend polls / receives update
```

Candidate future technology: Redis + BullMQ. Trigger criteria are explicit: p95 search latency beyond a few seconds with providers enabled, or indexed library growth past the Section 17 ceiling.

---

# 41. Evolution Path

## Phase 1 — MVP *(current)*

```text
EJS shells · Vanilla JS · Node · Express · MongoDB
sharp · pHash/dHash/aHash · local storage
```

Capability: **local visual history matching** (index + search).

## Phase 1.5 — External Discovery

Add a reverse-image provider (TinEye-style paid API per Section 9.2). Capability: web-scale reverse-image discovery. **Deferred until API access and ToS alignment are confirmed.**

## Phase 2 — Stronger Local Resemblance

Add OpenCV (ORB/SIFT/AKAZE). Capability: crops, feature overlap, partial visual matches.

## Phase 3 — Semantic Visual Search

Add OpenCLIP + Qdrant/FAISS. Capability: broad visual resemblance; also unlocks true *visual* corpus matching (removing the Section 9.3 text-only limitation).

## Phase 4 — Recognition

Object recognition / classification / advanced visual analysis — only when technically and legally justified.

---

# 42. Legal & Ethical Boundary

Saka-irs distinguishes between **publicly searchable** and **permitted to automatically access**. Visibility on a website does not imply scraping permission. External providers are selected only by: API availability, licensing, terms of use, technical access restrictions, applicable law, and permitted data usage. Saka-irs never bypasses authentication or anti-bot mechanisms.

---

# 43. Success Criteria & Definition of Done

The MVP succeeds when:

- it runs with Node.js; MongoDB works correctly; EJS renders the interface shells
- all frontend behavior is Vanilla JavaScript; all backend code is plain JS
- **both Index (`POST /api/images`) and Search (`POST /api/search`) work end-to-end** [UPDATE]
- images are validated (magic bytes), normalized (Section 14 rules), fingerprinted, thumbnailed
- local matching works with **benchmark-calibrated thresholds**
- results are classified by source and labeled Strong/Moderate/Weak
- external providers are optional; their failures never break local search; timeouts enforced
- results deduplicate via normalized URLs and merge `foundVia`
- metadata can be inspected locally; GPS never leaves the machine
- retention TTL works **and the sweeper removes orphaned files** [UPDATE]
- no unnecessary infrastructure is required

> **Definition of Done:** A user can index images into Saka-irs's library and upload a query image that Saka-irs matches against its own indexed history for exact, near-duplicate, and perceptually similar images — optionally querying external discovery/corpus providers — then aggregates, deduplicates, ranks, classifies, and presents the evidence clearly while maintaining a strict distinction between local matches, external discoveries, and broader visual resemblance.

---

# 44. Canonical Product Description

> **Saka-irs is an Image Recognition Software project that provides image-first visual search, resemblance analysis, and image discovery through a provider-independent architecture. Its MVP uses plain JavaScript across the stack — Node.js, Express, and MongoDB in a MERN-compatible layout with an EJS + Vanilla JavaScript frontend — plus perceptual image hashing to search a user's local image history, while optional external providers extend the system toward reverse-image discovery, public image corpora, and eventually semantic visual search.**

---

# Appendix A — v3.0 Concrete Fixes Applied

| # | Fix | Sections |
| --- | --- | --- |
| 1 | Explicit **Index vs Search** split (`POST /api/images` vs `POST /api/search`) | 10, 12, 34 |
| 2 | Hash-stability normalization rules pinned (EXIF orient, alpha flatten, 32×32, one buffer) | 14 |
| 3 | Hashing locked: `sharp` normalization + in-house DCT pHash/dHash/aHash computed from one shared raw buffer (rule R6); aHash low-weighted | 6.3, 14, 15 |
| 4 | Local-provider scale ceiling documented (~50k comfortable); BK-tree/multi-index deferred | 17 |
| 5 | External landscape updated: Bing retired 2025, TinEye legit path, corpus APIs text-only → hints-driven | 9.2, 9.3, 21, 28 |
| 6 | Retention orphans fixed: TTL index **plus file sweeper** | 32 |
| 7 | Validation hardened: magic bytes, decode proof, ~50MP pixel-bomb cap, UUID filenames | 13, 33 |
| 8 | Sanitization defined as sharp re-encode without `.withMetadata()` (EXIF/GPS auto-stripped) | 20, 30 |
| 9 | Providers run via `Promise.allSettled()` with hard AbortController timeouts | 11, 20, 22 |
| 10 | API exposes per-provider status; confidence buckets replace universal percentages | 24, 25, 34 |
| 11 | URL-normalized cross-provider deduplication | 23 |
| 12 | Model additions: `normalizedPath`, `thumbnailPath` (256px WebP), TTL indexes | 12, 31 |
| 13 | Frontend simplified to EJS shells only; no `results.ejs`; client-side rendering preserved for React swap | 35 |
| 14 | Provider contract by convention (duck typing) instead of class inheritance | 8 |
| 15 | Tests via built-in `node:test`; benchmark dataset generated with sharp itself | 38, 39 |

---

*End of Saka-irs Official Documentation — Version 3.0*










