/**
 * LocalHashProvider — searches Saka-irs's own indexed collection.
 *
 * Mechanism: load candidate hashes → in-memory Hamming distance
 * (XOR popcount) → benchmarked thresholds → raw candidates.
 *
 * Scale ceiling (documentation §17): comfortable to ~50k indexed images;
 * BK-tree / multi-index hashing deferred by design.
 *
 * Returns RAW results only — ResultService owns normalize/dedupe/rank.
 */

const Image = require('../models/Image');
const { hammingDistanceHex } = require('../utils/hamming');
const { VISUAL_MATCH_THRESHOLD } = require('../utils/ranking');

module.exports = {
    name: 'local-hash',
    sourceType: 'local',
    matchMethod: 'perceptual_hash',

    isEnabled() {
        return process.env.LOCAL_PROVIDER === 'true';
    },

    /**
     * @param {object} input { hashes:{phash,dhash,ahash}, contentHash, excludeId }
     * @returns {Promise<object[]>} raw local candidates
     */
    async search(input) {
        const started = Date.now();
        const { hashes, contentHash, excludeId } = input;

        if (!hashes || !hashes.phash) {
            return [];
        }

        // Only library images are searchable — query copies never self-match.
        const filter = { role: 'library' };
        if (excludeId) {
            filter._id = { $ne: excludeId };
        }

        const candidates = await Image.find(filter)
            .select('originalName hashes contentHash thumbnailPath')
            .lean();

        const results = [];

        for (const candidate of candidates) {
            if (!candidate.hashes) continue;

            const phashDist = hammingDistanceHex(hashes.phash, candidate.hashes.phash);
            const dhashDist = hammingDistanceHex(hashes.dhash, candidate.hashes.dhash);
            const ahashDist = hammingDistanceHex(hashes.ahash, candidate.hashes.ahash);

            // Provider gate — pHash primary, dHash rescue lane (§16).
            const passes =
                phashDist <= VISUAL_MATCH_THRESHOLD ||
                dhashDist <= VISUAL_MATCH_THRESHOLD;
            const isContentMatch =
                !!contentHash && !!candidate.contentHash && contentHash === candidate.contentHash;

            if (!passes && !isContentMatch) continue;

            results.push({
                imageId: String(candidate._id),
                title: candidate.originalName,
                thumbnailPath: candidate.thumbnailPath,
                sourceType: 'local',
                provider: 'saka-irs',
                matchMethod: 'perceptual_hash',
                distances: { phash: phashDist, dhash: dhashDist, ahash: ahashDist },
                contentMatch: isContentMatch,
                providerDurationMs: Date.now() - started
            });
        }

        // Within-provider ranking: strongest evidence first (§24).
        results.sort((a, b) => {
            if (a.contentMatch !== b.contentMatch) return a.contentMatch ? -1 : 1;
            return (
                a.distances.phash - b.distances.phash ||
                a.distances.dhash - b.distances.dhash
            );
        });

        return results;
    }
};
