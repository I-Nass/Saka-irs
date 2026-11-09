/**
 * ExternalCache — per-provider result cache for metered external APIs.
 *
 * Why this exists: free tiers are counted in tens or hundreds of requests
 * (trace.moe ≈100/day, SerpApi = 100/month). A single afternoon of repeat
 * searches would burn a month of budget without it.
 *
 * Keyed by (provider, cacheKey). `cacheKey` is normally the sha256 of the
 * ORIGINAL image bytes, so a re-encoded/resized re-upload still hits the row.
 *
 * Every method degrades to a no-op when the database is unavailable — a cache
 * miss must never fail a search.
 */

const ExternalLookup = require('../models/ExternalLookup');
const { isDbReady } = require('../config/db');

const DEFAULT_TTL_DAYS = parseInt(process.env.EXTERNAL_CACHE_DAYS || '30', 10);

/**
 * @returns {Promise<object[]|null>} cached results, or null on miss/unavailable
 */
async function get(provider, cacheKey) {
    if (!provider || !cacheKey || !isDbReady()) return null;

    try {
        const doc = await ExternalLookup.findOne({ provider, cacheKey }).lean();
        return doc ? (doc.results || []) : null;
    } catch (err) {
        console.error(`[cache] read failed (${provider}) → ${err.message}`);
        return null;
    }
}

async function set(provider, cacheKey, results, ttlDays = DEFAULT_TTL_DAYS) {
    if (!provider || !cacheKey || !Array.isArray(results) || !isDbReady()) return false;

    try {
        const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);
        await ExternalLookup.updateOne(
            { provider, cacheKey },
            { $set: { results, createdAt: new Date(), expiresAt } },
            { upsert: true }
        );
        return true;
    } catch (err) {
        console.error(`[cache] write failed (${provider}) → ${err.message}`);
        return false;
    }
}

/** Number of cached rows per provider — used by /api/health. */
async function stats(provider) {
    if (!isDbReady()) return null;
    try {
        return await ExternalLookup.countDocuments({ provider });
    } catch {
        return null;
    }
}

module.exports = { get, set, stats, DEFAULT_TTL_DAYS };
