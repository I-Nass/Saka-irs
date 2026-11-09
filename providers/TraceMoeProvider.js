/**
 * TraceMoeProvider — reverse-image search via trace.moe (free, keyless).
 *
 * Why this one: it is the only reverse-image engine that (a) has an official
 * public API, (b) accepts a real image upload instead of requiring a public
 * URL, and (c) needs no account or key. Google Lens and Yandex have no public
 * API, Bing Visual Search was retired in Aug 2025, and TinEye is paid.
 *
 * Scope: anime scenes only. It maps a screenshot to series / episode / timestamp
 * by content-based retrieval, not hashing. For anything else it returns nothing,
 * which is why this provider ships DISABLED by default — an anime hit on a
 * landscape photo is worse than no answer.
 *
 * Budget: the anonymous tier is small (≈100 searches/day per IP at time of
 * writing, concurrency 1). Therefore:
 *   1. results are cached by content hash (repeat searches cost nothing)
 *   2. a local daily counter stops us before the API rate-limits us
 *   3. when the budget is spent we return { skipped, reason } — never an error
 */

const fs = require('fs/promises');

const ImageService = require('../services/ImageService');
const FingerprintService = require('../services/FingerprintService');
const ExternalCache = require('../services/ExternalCache');
const QuotaService = require('../services/QuotaService');

const NAME = 'tracemoe';
const DEFAULT_API_URL = 'https://api.trace.moe/search?anilistInfo=1&cutBorders=1';
const USER_AGENT = 'Saka-irs/3.0 (local visual search; +trace.moe provider)';

/**
 * trace.moe is open source and self-hostable, so the endpoint is overridable —
 * a user running their own index gets the full daily quota instead of the
 * shared anonymous one.
 */
function apiUrl() {
    return String(process.env.TRACEMOE_API_URL || DEFAULT_API_URL).trim();
}

/** Highest similarity we treat as certain, and the noise floor we discard. */
const STRONG_SIMILARITY = 0.95;
const MODERATE_SIMILARITY = 0.87;
const NOISE_FLOOR = 0.75;

function dailyLimit() {
    const parsed = parseInt(process.env.TRACEMOE_DAILY_LIMIT || '100', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 100;
}

/** Keep our own deadline below SearchService's outer provider budget. */
function timeoutMs() {
    const parsed = parseInt(process.env.TRACEMOE_TIMEOUT_MS || '7000', 10);
    return Math.min(Math.max(Number.isFinite(parsed) ? parsed : 7000, 1000), 20000);
}

function titleFor(anilist) {
    const titles = (anilist && anilist.title) || {};
    return titles.english || titles.romaji || titles.native || 'Anime scene match';
}

function confidenceFor(similarity) {
    if (similarity >= STRONG_SIMILARITY) return 'strong';
    if (similarity >= MODERATE_SIMILARITY) return 'moderate';
    return 'weak';
}

function mapFrame(frame, durationMs) {
    const similarity = Number.isFinite(frame.similarity) ? frame.similarity : 0;
    const anilistId = frame.anilist && frame.anilist.id ? frame.anilist.id : null;

    return {
        id: `tracemoe:${anilistId || 'unknown'}:${frame.from || 0}`,
        title: titleFor(frame.anilist),
        url: anilistId ? `https://anilist.co/anime/${anilistId}` : null,
        imageUrl: frame.image || null,

        sourceType: 'reverse',
        provider: NAME,
        matchMethod: 'content_retrieval',
        matchType: 'anime_scene',
        confidence: confidenceFor(similarity),

        metadata: {
            similarity: Number(similarity.toFixed(4)),
            episode: frame.episode !== undefined && frame.episode !== null ? frame.episode : null,
            timestampSeconds: typeof frame.from === 'number' ? Math.round(frame.from) : null,
            timestampEndSeconds: typeof frame.to === 'number' ? Math.round(frame.to) : null,
            filename: frame.filename || null,
            anilistId,
            previewVideo: frame.video || null,
            retrieval: 'content-based (trace.moe index)'
        },

        providerDurationMs: durationMs
    };
}

async function requestSearch(imageBuffer) {
    const form = new FormData();
    form.append('image', new Blob([imageBuffer], { type: 'image/jpeg' }), 'query.jpg');

    const response = await fetch(apiUrl(), {
        method: 'POST',
        body: form,
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs())
    });

    if (!response.ok) {
        throw new Error(`trace.moe HTTP ${response.status}`);
    }

    const data = await response.json();
    if (data && data.error) {
        throw new Error(`trace.moe: ${data.error}`);
    }
    return data;
}

module.exports = {
    name: NAME,
    sourceType: 'reverse',
    matchMethod: 'content_retrieval',

    /** Metered + niche → opt-in only. */
    isEnabled() {
        return process.env.TRACEMOE_PROVIDER === 'true';
    },

    /** Daily allowance, used by /api/health. */
    quota() {
        return { period: 'day', limit: dailyLimit() };
    },

    /**
     * @param {object} input { queryImageId, contentHash, hashes, hints }
     * @returns {Promise<object[]|object>} raw results or { skipped: true, reason }
     */
    async search(input) {
        const started = Date.now();

        if (!input.queryImageId) return [];

        // 1. Cache first — a cached answer must never spend quota.
        const cacheKey = input.contentHash || null;
        const cached = await ExternalCache.get(NAME, cacheKey);
        if (cached) {
            return cached.map((item) => ({ ...item, providerDurationMs: Date.now() - started }));
        }

        // 2. Then budget. Refuse cleanly instead of collecting a 429.
        const quota = await QuotaService.consume(NAME, { period: 'day', limit: dailyLimit() });
        if (!quota.allowed) {
            return {
                skipped: true,
                reason: `trace.moe daily quota exhausted (${quota.used}/${quota.limit})`
            };
        }

        // 3. Build a small, metadata-stripped upload from the stored original.
        const doc = await ImageService.getImageDoc(input.queryImageId);
        const sourcePath = doc.storagePath || doc.thumbnailPath;
        if (!sourcePath) return [];

        const original = await fs.readFile(sourcePath);
        const upload = await FingerprintService.makeUploadDerivative(original, { maxDim: 900 });

        const data = await requestSearch(upload);
        const frames = Array.isArray(data.result) ? data.result : [];
        const durationMs = Date.now() - started;

        const results = frames
            .filter((frame) => frame && Number.isFinite(frame.similarity) && frame.similarity >= NOISE_FLOOR)
            .slice(0, 8)
            .map((frame) => mapFrame(frame, durationMs));

        // 4. Remember the answer (including an empty one) so we don't re-spend.
        await ExternalCache.set(NAME, cacheKey, results);

        return results;
    }
};
