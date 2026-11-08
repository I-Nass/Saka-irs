/**
 * GoogleVisionProvider — Category B (Generous Free Tier: 1,000 free calls/mo).
 * Real reverse-image web detection using Google Cloud Vision webDetection.
 *
 * Contract: { name, sourceType, matchMethod, isEnabled(), search(input) }
 */

const dns = require('dns');
try {
    dns.setDefaultResultOrder('ipv4first');
} catch { /* Node fallback */ }

const fs = require('fs/promises');
const https = require('https');
const ImageService = require('../services/ImageService');

module.exports = {
    name: 'google-vision',
    sourceType: 'web_discovery',
    matchMethod: 'reverse_image',

    isEnabled() {
        return process.env.EXTERNAL_REVERSE_PROVIDER === 'true' &&
            Boolean(process.env.GOOGLE_VISION_API_KEY);
    },

    /**
     * @param {object} input { queryImageId, hashes, contentHash, hints }
     * @returns {Promise<object[]>} raw external candidate results
     */
    async search(input) {
        if (!input.queryImageId) return [];

        const started = Date.now();
        const doc = await ImageService.getImageDoc(input.queryImageId);
        if (!doc || !doc.thumbnailPath) return [];

        // Read the sanitized thumbnail (EXIF and GPS already stripped)
        const imageBuffer = await fs.readFile(doc.thumbnailPath);
        const base64Image = imageBuffer.toString('base64');

        const requestBody = JSON.stringify({
            requests: [
                {
                    image: { content: base64Image },
                    features: [{ type: 'WEB_DETECTION', maxResults: 15 }]
                }
            ]
        });

        const apiKey = process.env.GOOGLE_VISION_API_KEY;
        const url = `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`;

        const responseData = await new Promise((resolve, reject) => {
            const req = https.request(
                url,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(requestBody)
                    },
                    timeout: 7500
                },
                (res) => {
                    let data = '';
                    res.on('data', (c) => { data += c; });
                    res.on('end', () => {
                        try {
                            const parsed = JSON.parse(data);
                            if (res.statusCode >= 400) {
                                reject(new Error(parsed.error ? parsed.error.message : `HTTP ${res.statusCode}`));
                            } else {
                                resolve(parsed);
                            }
                        } catch (e) {
                            reject(new Error('Failed to parse Google Vision response.'));
                        }
                    });
                }
            );

            req.on('timeout', () => req.destroy(new Error('Google Vision timed out.')));
            req.on('error', reject);
            req.write(requestBody);
            req.end();
        });

        const webDetection = responseData.responses?.[0]?.webDetection;
        if (!webDetection) return [];

        const results = [];

        if (Array.isArray(webDetection.pagesWithMatchingImages)) {
            for (const page of webDetection.pagesWithMatchingImages) {
                const fullMatch = page.fullMatchingImages?.[0]?.url;
                const partialMatch = page.partialMatchingImages?.[0]?.url;
                const imgUrl = fullMatch || partialMatch || null;

                results.push({
                    id: page.url,
                    title: page.pageTitle || page.url,
                    url: page.url,
                    imageUrl: imgUrl,
                    sourceType: 'web_discovery',
                    provider: 'google-vision',
                    matchMethod: 'reverse_image',
                    matchType: fullMatch ? 'exact_duplicate' : 'web_discovery',
                    confidence: fullMatch ? 'strong' : 'moderate',
                    metadata: {
                        pageTitle: page.pageTitle,
                        entities: (webDetection.webEntities || []).slice(0, 3).map((e) => e.description)
                    },
                    providerDurationMs: Date.now() - started
                });
            }
        }

        return results;
    }
};
