/**
 * ResultService — the shared result pipeline (documentation §22–26):
 * normalize → deduplicate → rank → classify → group.
 *
 * Every result keeps its source attribution. Confidence is bucketed
 * (strong/moderate/weak) per method — never a universal percentage.
 */

const { classifyLocalMatch, categoryFor } = require('../utils/ranking');

/** Attach presentation fields to a raw provider result. */
function normalizeResult(raw) {
    if (!raw || !raw.provider) return null;

    const base = {
        id: raw.imageId || raw.id || null,
        imageUrl: raw.imageUrl || raw.thumbnailUrl || null,
        sourceUrl: raw.url || null,
        sourceType: raw.sourceType || 'local',
        provider: raw.provider,
        matchMethod: raw.matchMethod || 'unknown',
        matchType: raw.matchType || 'visually_similar',
        confidence: raw.confidence || 'weak',
        distance: raw.distance !== undefined ? raw.distance : null,
        title: raw.title || null,
        metadata: raw.metadata || {},
        foundVia: [],
        foundAt: new Date().toISOString()
    };

    if (base.sourceType === 'local') {
        const cls = classifyLocalMatch({
            phashDist: raw.distances ? raw.distances.phash : Infinity,
            dhashDist: raw.distances ? raw.distances.dhash : Infinity,
            contentMatch: !!raw.contentMatch
        });
        base.matchType = cls.matchType;
        base.confidence = cls.confidence;
        base.distance =
            raw.distances && Number.isFinite(raw.distances.phash)
                ? raw.distances.phash
                : null;
    }

    return base;
}

/** Merge results that refer to the same target (local id or normalized URL). */
function dedupeResults(results) {
    const byKey = new Map();

    for (const result of results) {
        // Local targets key on imageId; external ones would key on
        // sanitize.normalizeUrl(sourceUrl) once external providers exist.
        const key = result.sourceType === 'local'
            ? `id:${result.id}`
            : `url:${(result.sourceUrl || '').toLowerCase()}`;

        if (!byKey.has(key)) {
            result.foundVia.push(result.matchMethod);
            byKey.set(key, result);
        } else {
            const existing = byKey.get(key);
            if (!existing.foundVia.includes(result.matchMethod)) {
                existing.foundVia.push(result.matchMethod);
            }
        }
    }

    return Array.from(byKey.values());
}

/** Confidence order for stable sorting. */
const CONFIDENCE_RANK = { strong: 0, moderate: 1, weak: 2 };

function sortResults(results) {
    return results.sort((a, b) => {
        if (CONFIDENCE_RANK[a.confidence] !== CONFIDENCE_RANK[b.confidence]) {
            return CONFIDENCE_RANK[a.confidence] - CONFIDENCE_RANK[b.confidence];
        }
        if (a.distance !== null && b.distance !== null && a.distance !== b.distance) {
            return a.distance - b.distance;
        }
        return 0;
    });
}

/** Group into §26 UI categories with counts. */
function groupResults(results) {
    const grouped = { duplicates: [], resemblance: [], discovery: [] };
    for (const result of results) {
        grouped[categoryFor(result.matchType)].push(result);
    }
    return grouped;
}

/**
 * Full pipeline for one search's collected raw arrays.
 * @param {object} imageUrlResolver fn(imageId) → display URL
 */
function buildFinalResults(rawArrays, imageUrlResolver) {
    const flattened = [];
    for (const arr of rawArrays) {
        if (!Array.isArray(arr)) continue;
        for (const raw of arr) {
            const normalized = normalizeResult(raw);
            if (!normalized) continue;
            if (normalized.sourceType === 'local' && normalized.id && imageUrlResolver) {
                normalized.imageUrl = imageUrlResolver(normalized.id);
            }
            flattened.push(normalized);
        }
    }

    const deduped = dedupeResults(flattened);
    const sorted = sortResults(deduped);

    return {
        count: sorted.length,
        categories: groupResults(sorted),
        results: sorted
    };
}

module.exports = { normalizeResult, dedupeResults, buildFinalResults, categoryFor };
