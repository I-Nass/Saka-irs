/**
 * Ranking & classification policy (documentation §24).
 *
 *  - classification happens WITHIN a provider, never across providers
 *  - bucketed confidence labels replace universal percentages
 *  - results stay grouped by category in presentation
 */

const NEAR_DUPLICATE_THRESHOLD = parseInt(process.env.NEAR_DUPLICATE_THRESHOLD || '6', 10);
const VISUAL_MATCH_THRESHOLD = parseInt(process.env.VISUAL_MATCH_THRESHOLD || '12', 10);

/**
 * Classify a local perceptual candidate.
 * @returns {{ matchType: string, confidence: string }}
 */
function classifyLocalMatch({ phashDist, dhashDist, contentMatch }) {
    // Level 1 — same bytes or fully agreeing fingerprints.
    if (contentMatch || (phashDist === 0 && dhashDist === 0)) {
        return { matchType: 'exact_duplicate', confidence: 'strong' };
    }

    // Primary gate on pHash; dHash can independently carry near-duplicates.
    const best = Math.min(phashDist, dhashDist);

    if (phashDist <= NEAR_DUPLICATE_THRESHOLD || dhashDist <= NEAR_DUPLICATE_THRESHOLD) {
        return { matchType: 'near_duplicate', confidence: 'strong' };
    }

    if (best <= VISUAL_MATCH_THRESHOLD) {
        return { matchType: 'visually_similar', confidence: 'moderate' };
    }

    // Passed the provider gate only via the weaker signal.
    return { matchType: 'visually_similar', confidence: 'weak' };
}

/** Presentation grouping (documentation §26 categories). */
function categoryFor(matchType) {
    switch (matchType) {
        case 'exact_duplicate':
        case 'near_duplicate':
            return 'duplicates';
        case 'feature_match':
        case 'visually_similar':
        case 'visual_resemblance':
            return 'resemblance';
        case 'web_discovery':
        case 'web_exact_match':
        case 'web_visual_match':
        case 'anime_scene':
        case 'corpus_match':
            return 'discovery';
        default:
            return 'resemblance';
    }
}

module.exports = {
    NEAR_DUPLICATE_THRESHOLD,
    VISUAL_MATCH_THRESHOLD,
    classifyLocalMatch,
    categoryFor
};
