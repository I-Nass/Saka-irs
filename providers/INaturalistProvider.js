/**
 * INaturalistProvider — Biological & Wildlife Taxonomy Identification.
 *
 * Connects to the official public computer vision API of iNaturalist
 * (California Academy of Sciences & National Geographic).
 *
 * Identifies flora, fauna, insects, and fungi from photos, mapping them to
 * scientific Linnaean taxonomy (family, genus, species) and IUCN conservation status.
 *
 * Metered/network-dependent → Opt-in via INATURALIST_PROVIDER=true in .env.
 */

const fs = require('fs/promises');

const ImageService = require('../services/ImageService');
const FingerprintService = require('../services/FingerprintService');
const ExternalCache = require('../services/ExternalCache');

const NAME = 'inaturalist';
const API_URL = 'https://api.inaturalist.org/v1/computations/similar_species';
const USER_AGENT = 'Saka-irs/3.0 (visual search; +inaturalist species provider)';

function timeoutMs() {
    const parsed = parseInt(process.env.INATURALIST_TIMEOUT_MS || '7000', 10);
    return Math.min(Math.max(Number.isFinite(parsed) ? parsed : 7000, 1000), 15000);
}

function mapTaxon(result, durationMs) {
    const taxon = result.taxon || {};
    const defaultPhoto = taxon.default_photo || {};
    const commonName = taxon.preferred_common_name || taxon.name || 'Unknown species';

    return {
        id: `inat:${taxon.id || 'taxon'}`,
        title: `${commonName} (${taxon.name || 'Species'})`,
        url: taxon.wikipedia_url || `https://www.inaturalist.org/taxa/${taxon.id || ''}`,
        imageUrl: defaultPhoto.medium_url || defaultPhoto.square_url || null,
        sourceType: 'specialized',
        provider: NAME,
        matchMethod: 'species_identification',
        matchType: 'species_match',
        confidence: result.combined_score > 0.85 ? 'strong' : result.combined_score > 0.65 ? 'moderate' : 'weak',
        metadata: {
            scientificName: taxon.name,
            commonName,
            rank: taxon.rank,
            matchedTaxonId: taxon.id,
            visionScore: Number(Number(result.combined_score || 0).toFixed(3)),
            wikipediaUrl: taxon.wikipedia_url || null
        },
        providerDurationMs: durationMs
    };
}

module.exports = {
    name: NAME,
    sourceType: 'specialized',
    matchMethod: 'species_identification',

    /** Opt-in: external scientific endpoint */
    isEnabled() {
        return process.env.INATURALIST_PROVIDER === 'true';
    },

    async search(input) {
        const started = Date.now();
        if (!input.queryImageId) return [];

        const cacheKey = input.contentHash ? `inat:${input.contentHash}` : null;
        if (cacheKey) {
            const cached = await ExternalCache.get(NAME, cacheKey);
            if (cached) {
                return cached.map((c) => ({ ...c, providerDurationMs: Date.now() - started }));
            }
        }

        const doc = await ImageService.getImageDoc(input.queryImageId);
        const sourcePath = doc.storagePath || doc.thumbnailPath;
        if (!sourcePath) return [];

        const original = await fs.readFile(sourcePath);
        const uploadDerivative = await FingerprintService.makeUploadDerivative(original, {
            maxDim: 800,
            maxBytes: 300 * 1024
        });

        const formData = new FormData();
        formData.append('image', new Blob([uploadDerivative], { type: 'image/jpeg' }), 'query.jpg');

        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                body: formData,
                headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
                signal: AbortSignal.timeout(timeoutMs())
            });

            if (!response.ok) {
                return { skipped: true, reason: `iNaturalist API HTTP ${response.status}` };
            }

            const data = await response.json().catch(() => ({}));
            const results = (data.results || [])
                .slice(0, 5)
                .map((r) => mapTaxon(r, Date.now() - started));

            if (cacheKey && results.length > 0) {
                await ExternalCache.set(NAME, cacheKey, results, 30);
            }

            return results;
        } catch (err) {
            return { skipped: true, reason: `iNaturalist connection: ${err.message}` };
        }
    }
};

