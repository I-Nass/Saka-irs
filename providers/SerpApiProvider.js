/**
 * SerpApiProvider — automated general-web reverse image search.
 *
 * Why this one: SerpApi is the only free-tier route to a real Google Lens /
 * Yandex lookup without a credit card. The free plan is ~100 searches/month,
 * so this provider ships DISABLED and only activates when SERPAPI_KEY is set.
 *
 * Local-first note (read this before enabling it): unlike the pivot panel, this
 * provider actually transmits pixels. The image it sends is a metadata-stripped
 * derivative produced by `FingerprintService.makeUploadDerivative()` — no EXIF,
 * no GPS, no colour profile — but it does leave the machine. That trade is the
 * user's to make, so it is opt-in and documented in .env.example.
 *
 * Two-step flow (the Image API exists precisely for machines without a public
 * image URL):
 *   1. POST https://serpapi.com/image   (multipart: api_key + image) → image_id
 *      JPG/PNG/WebP, max 500 KB, id expires after 10 minutes.
 *   2. GET  https://serpapi.com/search.json?engine=google_lens&image_id=...
 *
 * Yandex: the `yandex_images` engine takes an image *URL*, not an upload, so it
 * is only attempted when PUBLIC_BASE_URL points at a publicly reachable copy of
 * this app. Otherwise it is skipped rather than silently omitted.
 */

const fs = require('fs/promises');

const ImageService = require('../services/ImageService');
const FingerprintService = require('../services/FingerprintService');
const ExternalCache = require('../services/ExternalCache');
const QuotaService = require('../services/QuotaService');

const NAME = 'serpapi';
const UPLOAD_URL = 'https://serpapi.com/image';
const SEARCH_URL = 'https://serpapi.com/search.json';
const USER_AGENT = 'Saka-irs/3.0 (local visual search; +serpapi provider)';

/** SerpApi's Image API hard limit is 500 KB; keep a little headroom. */
const MAX_UPLOAD_BYTES = 495 * 1024;
const MAX_RESULTS_PER_ENGINE = 10;

function monthlyLimit() {
    const parsed = parseInt(process.env.SERPAPI_MONTHLY_LIMIT || '100', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 100;
}

function timeoutMs() {
    const parsed = parseInt(process.env.SERPAPI_TIMEOUT_MS || '7000', 10);
    return Math.min(Math.max(Number.isFinite(parsed) ? parsed : 7000, 1000), 20000);
}

function apiKey() {
    return String(process.env.SERPAPI_KEY || '').trim();
}

/** Public HTTPS origin SerpApi/Yandex could fetch, or null. */
function publicBaseUrl() {
    const raw = String(process.env.PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');
    if (!raw) return null;
    try {
        const url = new URL(raw);
        return url.protocol === 'https:' ? raw : null;
    } catch {
        return null;
    }
}

function cleanUrl(value) {
    if (typeof value !== 'string') return null;
    return /^https?:\/\//i.test(value) ? value : null;
}

function buildResult({ title, link, image, providerLabel, matchType, confidence, metadata, durationMs }) {
    return {
        id: `${providerLabel}:${link || image || title || 'result'}`,
        title: title || link || 'External match',
        url: cleanUrl(link),
        imageUrl: cleanUrl(image),
        sourceType: 'web_discovery',
        provider: NAME,
        matchMethod: 'reverse_image',
        matchType,
        confidence,
        metadata: {
            engine: providerLabel,
            confidenceBasis: 'engine result class (not a similarity score)',
            ...metadata
        },
        providerDurationMs: durationMs
    };
}

/** Google Lens payload → provider results. */
function mapLens(data, durationMs) {
    const results = [];

    const exact = Array.isArray(data.exact_matches) ? data.exact_matches : [];
    exact.slice(0, MAX_RESULTS_PER_ENGINE).forEach((item) => {
        results.push(buildResult({
            title: item.title,
            link: item.link,
            image: item.thumbnail || item.image,
            providerLabel: 'google-lens',
            matchType: 'web_exact_match',
            confidence: 'strong',
            metadata: { matchClass: 'exact', source: item.source || null, position: item.position || null },
            durationMs
        }));
    });

    const visual = Array.isArray(data.visual_matches) ? data.visual_matches : [];
    visual.slice(0, MAX_RESULTS_PER_ENGINE).forEach((item, index) => {
        results.push(buildResult({
            title: item.title,
            link: item.link,
            image: item.thumbnail || item.image,
            providerLabel: 'google-lens',
            matchType: 'web_visual_match',
            // Ranked classes, not a score: the first few are the engine's best guesses.
            confidence: index < 3 ? 'moderate' : 'weak',
            metadata: { matchClass: 'visual', source: item.source || null, position: item.position || null },
            durationMs
        }));
    });

    return results;
}

/** Yandex payload → provider results. Response shape is mapped defensively. */
function mapYandex(data, durationMs) {
    const items = Array.isArray(data.image_results)
        ? data.image_results
        : Array.isArray(data.visual_matches)
            ? data.visual_matches
            : [];

    return items.slice(0, MAX_RESULTS_PER_ENGINE).map((item, index) => buildResult({
        title: item.title || item.snippet,
        link: item.link,
        image: item.thumbnail || item.original || item.image,
        providerLabel: 'yandex',
        matchType: 'web_visual_match',
        confidence: index < 3 ? 'moderate' : 'weak',
        metadata: { matchClass: 'visual', source: item.source || null, position: item.position || null },
        durationMs
    }));
}

async function uploadImage(imageBuffer) {
    const form = new FormData();
    form.append('api_key', apiKey());
    form.append('image', new Blob([imageBuffer], { type: 'image/jpeg' }), 'query.jpg');

    const response = await fetch(UPLOAD_URL, {
        method: 'POST',
        body: form,
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs())
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.error || !data.image_id) {
        throw new Error(data.error || `SerpApi image upload failed (HTTP ${response.status})`);
    }
    return data.image_id;
}

async function lensSearch(imageId) {
    const url = new URL(SEARCH_URL);
    url.searchParams.set('engine', 'google_lens');
    url.searchParams.set('image_id', imageId);
    url.searchParams.set('type', 'all');
    url.searchParams.set('hl', 'en');
    url.searchParams.set('api_key', apiKey());

    const response = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs())
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.error) {
        throw new Error(data.error || `SerpApi Google Lens failed (HTTP ${response.status})`);
    }
    return data;
}

async function yandexSearch(imageUrl) {
    const url = new URL(SEARCH_URL);
    url.searchParams.set('engine', 'yandex_images');
    url.searchParams.set('url', imageUrl);
    url.searchParams.set('api_key', apiKey());

    const response = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs())
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.error) {
        throw new Error(data.error || `SerpApi Yandex failed (HTTP ${response.status})`);
    }
    return data;
}

module.exports = {
    name: NAME,
    sourceType: 'web_discovery',
    matchMethod: 'reverse_image',

    /** Opt-in: requires a free key, and transmits a sanitized derivative. */
    isEnabled() {
        return Boolean(apiKey());
    },

    quota() {
        return { period: 'month', limit: monthlyLimit() };
    },

    async search(input) {
        const started = Date.now();
        if (!input.queryImageId || !apiKey()) return [];

        // 1. Cache first — a repeated search must not spend a credit.
        const cacheKey = input.contentHash || null;
        const cached = await ExternalCache.get(NAME, cacheKey);
        if (cached) {
            return cached.map((item) => ({ ...item, providerDurationMs: Date.now() - started }));
        }

        // 2. Budget check before any external byte is spent.
        const quota = await QuotaService.consume(NAME, { period: 'month', limit: monthlyLimit() });
        if (!quota.allowed) {
            return {
                skipped: true,
                reason: `SerpApi monthly quota exhausted (${quota.used}/${quota.limit})`
            };
        }

        // 3. Sanitized derivative (EXIF/GPS stripped, ≤500 KB).
        const doc = await ImageService.getImageDoc(input.queryImageId);
        const sourcePath = doc.storagePath || doc.thumbnailPath;
        if (!sourcePath) return [];

        const original = await fs.readFile(sourcePath);
        const upload = await FingerprintService.makeUploadDerivative(original, {
            maxDim: 900,
            maxBytes: MAX_UPLOAD_BYTES
        });

        const results = [];

        // 4. Google Lens via the Image API (works without hosting anything).
        const imageId = await uploadImage(upload);
        const lensData = await lensSearch(imageId);
        results.push(...mapLens(lensData, Date.now() - started));

        // 5. Yandex only when this app is reachable from the internet.
        const base = publicBaseUrl();
        if (base) {
            const yandexQuota = await QuotaService.consume(NAME, {
                period: 'month',
                limit: monthlyLimit()
            });

            if (!yandexQuota.allowed) {
                console.warn('[serpapi] Yandex skipped — monthly quota exhausted');
            } else {
                try {
                    const imageUrl = `${base}/api/images/${encodeURIComponent(input.queryImageId)}/pivot.png`;
                    const yandexData = await yandexSearch(imageUrl);
                    results.push(...mapYandex(yandexData, Date.now() - started));
                } catch (err) {
                    // A Yandex failure must not discard the Lens results already earned.
                    console.error(`[serpapi] Yandex lookup failed → ${err.message}`);
                }
            }
        }

        await ExternalCache.set(NAME, cacheKey, results);
        return results;
    }
};
