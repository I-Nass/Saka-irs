/**
 * QuotaService — local accounting for metered external providers.
 *
 * Providers call consume() BEFORE spending a request. When the allowance is
 * gone they return `{ skipped: true, reason: ... }`, which SearchService already
 * renders honestly as "skipped" instead of pretending the provider failed.
 *
 * Buckets roll over automatically:
 *   period "day"   → day:YYYY-MM-DD
 *   period "month" → month:YYYY-MM
 *
 * Concurrency note: this is a single-user local tool, so the check-and-increment
 * is a guarded atomic update rather than a transaction. The only race is two
 * simultaneous searches of the same image, which the content-hash cache absorbs.
 */

const ProviderQuota = require('../models/ProviderQuota');
const { isDbReady } = require('../config/db');

const RETAIN_DAYS = 60;

function bucketFor(period, now = new Date()) {
    const iso = now.toISOString().slice(0, 10); // YYYY-MM-DD
    return period === 'month' ? `month:${iso.slice(0, 7)}` : `day:${iso}`;
}

function normaliseLimit(limit) {
    const parsed = parseInt(limit, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

/**
 * Reserve one unit of quota.
 * @returns {Promise<{allowed:boolean, used:number, limit:number, remaining:number, enforced:boolean}>}
 */
async function consume(provider, { period = 'day', limit } = {}) {
    const max = normaliseLimit(limit);

    // No limit configured → unlimited, nothing to enforce.
    if (max === 0) {
        return { allowed: true, used: 0, limit: 0, remaining: null, enforced: false };
    }

    // Quota accounting is best-effort; a search without a DB cannot happen
    // (requireDb guards the routes), but stay non-fatal regardless.
    if (!isDbReady()) {
        return { allowed: true, used: 0, limit: max, remaining: max, enforced: false };
    }

    const bucket = bucketFor(period);
    const expiresAt = new Date(Date.now() + RETAIN_DAYS * 24 * 60 * 60 * 1000);

    try {
        const doc = await ProviderQuota.findOneAndUpdate(
            { provider, bucket, used: { $lt: max } },
            { $inc: { used: 1 }, $set: { updatedAt: new Date() }, $setOnInsert: { expiresAt } },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        if (doc) {
            return {
                allowed: true,
                used: doc.used,
                limit: max,
                remaining: Math.max(0, max - doc.used),
                enforced: true
            };
        }
    } catch (err) {
        // Upsert collided with the unique (provider, bucket) index, which only
        // happens when the existing document is already at the limit.
        if (!err || err.code !== 11000) {
            console.error(`[quota] update failed (${provider}) → ${err && err.message}`);
            return { allowed: true, used: 0, limit: max, remaining: max, enforced: false };
        }
    }

    const current = await ProviderQuota.findOne({ provider, bucket }).lean().catch(() => null);
    return {
        allowed: false,
        used: current ? current.used : max,
        limit: max,
        remaining: 0,
        enforced: true
    };
}

/** Read usage without spending any. */
async function peek(provider, { period = 'day', limit } = {}) {
    const max = normaliseLimit(limit);
    if (max === 0) return { used: 0, limit: 0, remaining: null, enforced: false };
    if (!isDbReady()) return { used: 0, limit: max, remaining: max, enforced: false };

    try {
        const doc = await ProviderQuota.findOne({ provider, bucket: bucketFor(period) }).lean();
        const used = doc ? doc.used : 0;
        return { used, limit: max, remaining: Math.max(0, max - used), enforced: true };
    } catch {
        return { used: 0, limit: max, remaining: max, enforced: false };
    }
}

/** Current state for every configured metered provider (used by /api/health). */
async function snapshot(providers = []) {
    const out = {};
    for (const p of providers) {
        out[p.name] = await peek(p.name, { period: p.period, limit: p.limit });
    }
    return out;
}

module.exports = { consume, peek, snapshot, bucketFor };
