/**
 * WikimediaCorpusProvider — Category A (100% Free & Zero Key Required).
 * Searches the Wikimedia Commons historical & encyclopedic repository
 * using the official Wikimedia Foundation REST API.
 *
 * Contract: { name, sourceType, matchMethod, isEnabled(), search(input) }
 */

const dns = require('dns');
try {
    dns.setDefaultResultOrder('ipv4first');
} catch { /* Node fallback */ }

const https = require('https');

function fetchWikimedia(query, limit = 10, timeoutMs = 9000) {
    return new Promise((resolve, reject) => {
        const url = `https://api.wikimedia.org/core/v1/commons/search/page?q=${encodeURIComponent(query)}&limit=${limit}`;
        const req = https.get(
            url,
            {
                headers: {
                    'User-Agent': 'Saka-irs-OSINT-Search/3.0 (https://github.com/example/saka-irs; contact@example.com)'
                },
                timeout: timeoutMs
            },
            (res) => {
                let data = '';
                res.on('data', (c) => { data += c; });
                res.on('end', () => {
                    try {
                        if (res.statusCode === 429) {
                            reject(new Error('Wikimedia rate-limited (HTTP 429). Please wait a moment before re-querying.'));
                            return;
                        }
                        if (res.statusCode >= 400) {
                            reject(new Error(`Wikimedia HTTP ${res.statusCode}`));
                            return;
                        }
                        const parsed = JSON.parse(data);
                        resolve(parsed.pages || []);
                    } catch (err) {
                        reject(new Error('Failed to parse Wikimedia response.'));
                    }
                });
            }
        );

        req.on('timeout', () => {
            req.destroy(new Error('Wikimedia request timed out.'));
        });
        req.on('error', reject);
    });
}

module.exports = {
    name: 'wikimedia-corpus',
    sourceType: 'external_corpus',
    matchMethod: 'corpus_search',

    isEnabled() {
        return process.env.WIKIMEDIA_PROVIDER !== 'false';
    },

    /**
     * @param {object} input { queryImageId, hashes, contentHash, hints, originalName }
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
        ].filter(Boolean).map((s) => String(s).trim()).filter(Boolean);

        // Smart fallback: extract descriptive words from original image filename
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

        if (queryTerms.length === 0) {
            return {
                skipped: true,
                reason: 'no contextual hints supplied'
            };
        }

        const query = queryTerms.join(' ');
        const pages = await fetchWikimedia(query, 10);

        const results = [];
        for (const page of pages) {
            if (!page.thumbnail || !page.thumbnail.url) continue;

            let thumbUrl = page.thumbnail.url;
            if (thumbUrl.startsWith('//')) {
                thumbUrl = 'https:' + thumbUrl;
            }
            // Upgrade 60px thumbnail to crisp 320px preview
            thumbUrl = thumbUrl.replace(/\/60px-/, '/320px-');

            const pageUrl = `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.key || page.title)}`;

            results.push({
                id: `wiki_${page.id}`,
                title: (page.title || 'Wikimedia Media').replace(/^File:/i, '').replace(/_/g, ' '),
                url: pageUrl,
                imageUrl: thumbUrl,
                sourceType: 'external_corpus',
                provider: 'wikimedia',
                matchMethod: 'corpus_search',
                matchType: 'corpus_match',
                confidence: 'moderate',
                metadata: {
                    source: 'Wikimedia Commons',
                    key: page.key
                },
                providerDurationMs: Date.now() - started
            });
        }

        return results;
    }
};

