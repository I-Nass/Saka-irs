/**
 * ProviderQuota model — local accounting for metered external providers.
 *
 * Free tiers are tiny (trace.moe ~100/day, SerpApi 100/month). Without a local
 * counter the app only discovers an exhausted budget by receiving HTTP 429,
 * which looks like a broken provider instead of a spent allowance.
 *
 * One document per (provider, bucket), where bucket is "day:YYYY-MM-DD" or
 * "month:YYYY-MM". Records self-expire after 60 days.
 */

const mongoose = require('mongoose');

const providerQuotaSchema = new mongoose.Schema({
    provider: { type: String, required: true },
    bucket: { type: String, required: true },      // day:2026-11-09 | month:2026-11
    used: { type: Number, default: 0 },
    updatedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true }
});

providerQuotaSchema.index({ provider: 1, bucket: 1 }, { unique: true });
providerQuotaSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('ProviderQuota', providerQuotaSchema);
