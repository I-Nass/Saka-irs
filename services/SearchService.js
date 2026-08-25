/**
 * SearchService — search orchestration (documentation §22, §34).
 *
 * Providers run concurrently via Promise.allSettled with a hard timeout.
 * A provider failing NEVER fails the search; the response exposes
 * per-provider status truthfully.
 */

const Search = require('../models/Search');
const ResultService = require('./ResultService');
const { enabledProviders } = require('../providers');

function withTimeout(promise, ms, providerName) {
    return new Promise((resolve, reject) => {
        const t = setTimeout(
            () => reject(new Error(`${providerName} timed out after ${ms}ms`)),
            ms
        );
        promise.then(
            (value) => {
                clearTimeout(t);
                resolve(value);
            },
            (err) => {
                clearTimeout(t);
                reject(err);
            }
        );
    });
}

/**
 * Run all enabled providers against the staged query input.
 * @param {object} input { queryImageId, hashes, contentHash, hints }
 * @returns {Promise<object>} §34-shaped payload
 */
async function search(input) {
    const startedAt = Date.now();
    const providers = enabledProviders();
    const externalTimeoutMs = parseInt(process.env.EXTERNAL_TIMEOUT_MS || '8000', 10);

    // Local providers are in-process and fast; externals get the hard cap.
    function budgetFor(provider) {
        return provider.sourceType === 'local' ? externalTimeoutMs : externalTimeoutMs;
    }

    const settled = await Promise.allSettled(
        providers.map((p) => withTimeout(p.search(input), budgetFor(p), p.name))
    );

    const providerStatus = {};
    const fulfilledArrays = [];
    let okCount = 0;
    let failCount = 0;

    providers.forEach((provider, i) => {
        const outcome = settled[i];
        if (outcome.status === 'fulfilled') {
            const arr = Array.isArray(outcome.value) ? outcome.value : [];
            fulfilledArrays.push(arr);
            providerStatus[provider.name] = {
                status: 'ok',
                resultCount: arr.length,
                durationMs: outcome.value.providerDurationMs || undefined
            };
            okCount++;
        } else {
            providerStatus[provider.name] = {
                status: 'failed',
                error: String(outcome.reason && outcome.reason.message ? outcome.reason.message : outcome.reason)
            };
            failCount++;
        }
    });

    // Mark configured-but-not-run providers as skipped (e.g. corpus without hints).
    for (const key of ['external-corpus']) {
        if (!(key in providerStatus)) {
            providerStatus[key] = { status: 'skipped', reason: 'provider not enabled' };
        }
    }

    const finalResults = ResultService.buildFinalResults(fulfilledArrays, (imageId) =>
        `/api/images/${imageId}/thumbnail`
    );

    const durationMs = Date.now() - startedAt;

    let status = 'completed';
    if (okCount === 0 && failCount > 0) status = 'failed';
    else if (failCount > 0) status = 'partial';

    try {
        await Search.create({
            queryImageId: input.queryImageId || null,
            providersUsed: Object.entries(providerStatus).map(([name, s]) => ({
                name,
                status: s.status,
                resultCount: s.resultCount || 0,
                durationMs: s.durationMs || 0,
                error: s.error || null
            })),
            hints: input.hints || {},
            resultCount: finalResults.count,
            durationMs,
            status
        });
    } catch (err) {
        // History is best-effort; never poison a good response.
        console.error(`[search] history write failed → ${err.message}`);
    }

    return {
        searchId: null, // set by controller after create() when available
        durationMs,
        status,
        providers: providerStatus,
        count: finalResults.count,
        categories: finalResults.categories,
        results: finalResults.results
    };
}

module.exports = { search };
