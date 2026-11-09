/**
 * ExternalLookup model — cached results from external providers.
 *
 * External APIs are metered (trace.moe: ~100/day, SerpApi: 100/month), so a
 * repeated search of the same image must never spend quota twice. Records are
 * keyed by (provider, cacheKey) where cacheKey is normally the sha256 of the
 * ORIGINAL bytes, so a re-encoded upload still hits the same row.
 *
 * TTL-expired by MongoDB; no filesystem artifacts are involved.
 */

const mongoose = require('mongoose');

const externalLookupSchema = new mongoose.Schema({
    provider: { type: String, required: true },
    cacheKey: { type: String, required: true },

    // Raw provider payload (already normalized to the provider contract).
    // Cached verbatim so a cache hit costs no external request at all.
    results: { type: [mongoose.Schema.Types.Mixed], default: [] },

    createdAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true }
});

externalLookupSchema.index({ provider: 1, cacheKey: 1 }, { unique: true });
externalLookupSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('ExternalLookup', externalLookupSchema);
