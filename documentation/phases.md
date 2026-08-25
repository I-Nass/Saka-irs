# Saka-irs — Phase Roadmap

> **Backend & Frontend evolution plan**
> Companion to [`saka-irs_documentation.md`](saka-irs_documentation.md) (§41 Evolution Path). This file is the single source of truth for what is done, what is next, and in what order — across **both** tracks.

---

## Status Board

| Track | Phase | Name | Status |
|-------|-------|------|--------|
| Backend | B1 | Local visual history matching | ✅ **Done** |
| Backend | B1.5 | External reverse-image discovery | ⏸ Deferred (API/ToS) |
| Backend | B2 | Feature matching (crops/partial) | 🔜 Planned |
| Backend | B3 | Semantic visual search (CLIP) | 🔜 Planned |
| Backend | B4 | Recognition | 🧭 Long-term |
| Backend | BI | Infrastructure items (benchmarks, auth, jobs, cloud storage) | 🔁 Ongoing |
| Frontend | F1 | Identity & landing | ✅ **Done** |
| Frontend | F2 | Surfaces: Library, History, Metadata inspector | ✅ **Done** |
| Frontend | F3 | Results UX & input delight | 🔜 Next |
| Frontend | F4 | Delight & polish pass | 🧭 Later |

---

## Backend Phases

### B1 — Local Visual History Matching ✅

Shipped in the current MVP.

- Index flow (`POST /api/images`) + Search flow (`POST /api/search`)
- Normalization pipeline R1–R6 · in-house DCT pHash / dHash / aHash
- `LocalHashProvider`, Hamming ranking, confidence buckets
- Magic-byte validation, pixel-bomb cap, UUID storage, TTL retention + sweeper
- Per-provider status in responses; graceful 503 without DB

### B1.5 — External Reverse-Image Discovery ⏸

- Adds a reverse-image provider behind a paid, ToS-compliant API (TinEye-class). Bing APIs retired 2025; Google Lens has no official API.
- Sanitized-copy rule already enforced (sharp re-encode strips EXIF/GPS).
- **Entry criteria:** paid API access confirmed + ToS review passed.
- UI impact: results gain a *Web Discovery* category; dedup by normalized URL becomes active (`ResultService.dedupeResults`).

### B2 — Feature Matching 🔜

- OpenCV (ORB/SIFT/AKAZE via `opencv4nodejs` or a sidecar service) for cropped, rotated, partially visible queries.
- Runs as a **second local provider**; geometric verification produces a feature-overlap score mapped to the existing Strong/Moderate/Weak buckets.
- **Entry criteria:** benchmark harness (BI-1) shows hash-only recall is insufficient on transformed variants.

### B3 — Semantic Visual Search 🔜

- OpenCLIP embeddings + Qdrant/FAISS nearest-neighbor search.
- Unlocks Q4 (visual resemblance) and upgrades corpus providers from hint-driven text to true visual queries.
- **Entry criteria:** B1 stable at target library size; vector infra justified by real need.

### B4 — Recognition 🧭

Object detection/classification. Only when technically and legally justified (documentation §6, §42 boundaries apply unchanged).

### BI — Infrastructure Items (ongoing)

| ID | Item | Notes |
|----|------|-------|
| BI-1 | Benchmark harness | sharp-generated variant sets → calibrated thresholds into `.env` (doc §38) |
| BI-2 | Library list endpoint | `GET /api/images?limit&cursor` — required by F2 |
| BI-3 | Authentication | Required before any non-localhost deployment |
| BI-4 | Background job queue | Only if p95 latency justifies it (Redis + BullMQ) |
| BI-5 | Cloud storage swap | `StorageService` is the single seam |

---

## Frontend Phases

Constraint honored throughout: **EJS + Vanilla JavaScript + CSS only** — no framework, no bundler (documentation §33).

### F1 — Identity & Landing ✅ *(this release)*

- SVG logo mark + `favicon.svg` — no more default tab icon or emoji branding
- Sticky blurred header with anchor nav (Search / How it works / What it answers)
- Landing hero: headline *"Search with an image, not words."*, gradient accent, IMAGE → SEARCH → VISUAL RESULTS motif chips, CTAs scrolling to the tool
- "How it works" strip: Add → Saka Search → Evidence, classified
- Five-questions feature cards with **Live / Phase badges**
- Ambient background glows, footer roadmap ribbon
- All inline SVG icons; `prefers-reduced-motion` respected; boot test now asserts hero + favicon render

### F2 — Surfaces: Library, History, Metadata Inspector ✅ *(this release)*

Delivered:

| Item | Details | Backend dep |
|------|---------|-------------|
| Library view (`/library`) | Responsive thumbnail grid, per-card **Details + Delete**, stats bar (image count · storage bytes), Load-more pagination, empty state | ✅ **BI-2 shipped**: `GET /api/images?limit&offset` |
| History view (`/history`) | Timeline of last 20 searches — query thumbnail (24h retention), date, status pill (`completed/partial/failed`), result count, duration, hints summary, provider pills with error tooltips | existing `GET /api/searches` |
| Metadata inspector | Native `<dialog>` opened from any `[data-meta-id]` element via delegated click — filename, dimensions, size, type, added/expires, EXIF/camera/taken, **GPS presence badge** (coordinates never stored), truncated pHash/dHash/aHash with full values on hover | existing `GET /api/images/:id` |

Supporting changes: header nav gained Library/History links; `pageRoutes` refactored to a declarative page table; new client files `modal.js`, `library.js`, `history.js`; `app.js` gained `getJSON()`/`fmtBytes()` helpers; F2 CSS block appended.

Acceptance met: user can browse, delete, and inspect everything the backend knows — without curl. Verified by extended boot test (6/6 PASS).

### F3 — Results UX & Input Delight 🔜

- Side-by-side query-vs-match comparison on result cards
- Distance meter bars (distance / 64) replacing raw numbers
- Skeleton loaders during search; toast notifications replacing the status line
- Staggered card reveal animation
- **Paste-from-clipboard** image input (Ctrl+V screenshots) — high value for this use case

Acceptance: zero silent waits; every state change is visible.

### F4 — Delight & Polish Pass 🧭

- Empty-state illustrations; keyboard shortcuts (`/` focuses dropzone)
- Light/dark theme toggle; mobile layout audit at 360/768/1024px
- Micro-interaction audit (hover lift already in place from F1)

---

## Cross-Track Dependency Matrix

| Frontend phase | Depends on backend |
|----------------|--------------------|
| F1 Identity & landing | — (done) |
| F2 Surfaces | BI-2 list endpoint; existing search-history API |
| F3 Results UX | B1.5 for Web Discovery cards (degrades gracefully without) |
| F4 Polish | — |
| Any external-provider UI copy | B1.5 ToS decision |

## Definition of Done

- **Backend track:** documentation §43 unchanged — plus BI-1 benchmarks calibrated before B2/B3 merge.
- **Frontend track:** every backend capability is reachable from the UI; every result answers *what / where / why* visually; no framework ever enters `package.json`.

## Working Agreement

1. One phase at a time; each ships runnable and verified (`npm test`, `node scripts/boot-test.js`).
2. Status board above is updated the moment a phase lands.
3. New phases get added here first, then implemented.

