/**
 * OpenverseCorpusProvider — Category A (100% Free & Zero Key Required).
 * Searches the Openverse CC / Public Domain library using contextual hints.
 *
 * Contract: { name, sourceType, matchMethod, isEnabled(), search(input) }
 */

const dns = require('dns');
try {
    dns.setDefaultResultOrder('ipv4first');
} catch { /* Node fallback */ }

const https = require('https');

function fetchOpenverse(query, timeoutMs = 9000) {
    return new Promise((resolve, reject) => {
        const url = `https://api.openverse.org/v1/images/?q=${encodeURIComponent(query)}&page_size=12`;
        const req = https.get(
            url,
            {
                headers: {
                    'User-Agent': 'Saka-irs/3.0 (Visual Search; open-source)'
                },
                timeout: timeoutMs
            },
            (res) => {
                let data = '';
                res.on('data', (c) => { data += c; });
                res.on('end', () => {
                    try {
                        if (res.statusCode >= 400) {
                            reject(new Error(`Openverse HTTP ${res.statusCode}`));
                            return;
                        }
                        const parsed = JSON.parse(data);
                        resolve(parsed.results || []);
                    } catch (err) {
                        reject(new Error('Failed to parse Openverse response.'));
                    }
                });
            }
        );

        req.on('timeout', () => {
            req.destroy(new Error('Openverse request timed out.'));
        });
        req.on('error', reject);
    });
}

module.exports = {
    name: 'external-corpus',
    sourceType: 'external_corpus',
    matchMethod: 'corpus_search',

    isEnabled() {
        return process.env.EXTERNAL_CORPUS_PROVIDER === 'true';
    },

    /**
     * @param {object} input { queryImageId, hashes, contentHash, hints }
     * @returns {Promise<object[]|object>} candidate results or skip payload
     */
    async search(input) {
        const started = Date.now();
        const hints = input.hints || {};
        const queryTerms = [
            hints.keyword,
            hints.name,
            hints.location,
            hints.organization,
            hints.username
        ].filter(Boolean).map(s => String(s).trim()).filter(Boolean);

        // Smart fallback: if user provided no text hints, extract terms from the image filename
        if (queryTerms.length === 0 && input.originalName) {
            const rawName = String(input.originalName)
                .replace(/\.[a-z0-9]+$/i, '')
                .replace(/[-_+]/g, ' ')
                .replace(/[^a-zA-Z0-9\s]/g, '')
                .replace(/\s+/g, ' ')
                .trim();

            const isGeneric = /^(img|dsc|photo|image|screenshot|pxl|sample)[\s\d_-]*$/i.test(rawName);
            if (!isGeneric && rawName.length >= 3) {
                queryTerms.push(rawName);
            }
        }

        // Openverse is text-driven: skip cleanly if user provided no hints and filename is generic
        if (queryTerms.length === 0) {
            return {
                skipped: true,
                reason: 'no contextual hints supplied'
            };
        }

        const query = queryTerms.join(' ');
        const items = await fetchOpenverse(query);

        const results = items.map((item) => ({
            id: item.id,
            title: item.title || 'Untitled Archive Media',
            url: item.foreign_landing_url || item.url,
            imageUrl: item.thumbnail || item.url,
            sourceType: 'external_corpus',
            provider: 'openverse',
            matchMethod: 'corpus_search',
            matchType: 'corpus_match',
            confidence: 'moderate',
            metadata: {
                creator: item.creator || 'Unknown',
                license: item.license || 'Public / CC',
                source: item.source || item.provider || 'openverse'
            },
            providerDurationMs: Date.now() - started
        }));

        return results;
    }
};
