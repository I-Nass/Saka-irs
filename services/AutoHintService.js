/**
 * services/AutoHintService.js
 * Local Auto-Hinting & Content Extraction Engine (100% Offline, Zero Cost).
 *
 * Automatically infers contextual search hints from raw images when the user
 * doesn't provide them, combining:
 *   1. Intelligent Filename Semantic Parsing
 *   2. EXIF / IPTC / XMP Title & Caption Tag Extraction
 *   3. Color Palette & Environmental Biome Profiling (via sharp)
 */

const exifr = require('exifr');
const sharp = require('sharp');
const { sanitizeHint } = require('../utils/sanitize');

const STOP_WORDS = new Set([
    'the', 'and', 'for', 'with', 'from', 'this', 'that', 'image', 'photo',
    'picture', 'pic', 'wallpaper', 'banner', 'untitled', 'download', 'file',
    'screenshot', 'copy', 'final', 'edit', 'resized', 'thumb', 'thumbnail',
    'jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'tiff'
]);

const GENERIC_PREFIXES = /^(img|dsc|pxl|pic|photo|screenshot|dcim|frame)[-_0-9]*/i;

/**
 * Tokenize and sanitize meaningful terms from a filename.
 * e.g., "Safari_Kenya_banner.jpg" -> ["safari", "kenya"]
 */
function extractFromFilename(originalName) {
    if (!originalName || typeof originalName !== 'string') return [];

    const baseName = originalName.replace(/\.[a-z0-9]+$/i, '').trim();
    if (GENERIC_PREFIXES.test(baseName) && baseName.length < 16) {
        return [];
    }

    const tokens = baseName
        .replace(/[-_+._(),]+/g, ' ')
        .replace(/([a-z])([A-Z])/g, '$1 $2') // camelCase split
        .toLowerCase()
        .split(/\s+/)
        .map((t) => t.replace(/[^a-z0-9]/g, ''))
        .filter((t) => t.length > 2 && !STOP_WORDS.has(t) && !/^\d+$/.test(t));

    return Array.from(new Set(tokens)).slice(0, 5);
}

/**
 * Extract caption, title, or keyword tags from EXIF/IPTC/XMP headers.
 */
async function extractFromMetadata(buffer) {
    const terms = [];
    try {
        const parsed = await exifr.parse(buffer, {
            tiff: true,
            exif: true,
            iptc: true,
            xmp: true,
            mergeOutput: true,
            silentErrors: true
        });

        if (!parsed) return terms;

        const candidateFields = [
            parsed.Headline,
            parsed.ObjectName,
            parsed.ImageDescription,
            parsed.XPKeywords,
            parsed.XPComment,
            parsed.Subject,
            parsed.caption
        ];

        candidateFields.forEach((val) => {
            if (typeof val === 'string' && val.trim().length > 2) {
                const cleaned = sanitizeHint(val, 60);
                if (cleaned) terms.push(cleaned);
            } else if (Array.isArray(val)) {
                val.forEach((item) => {
                    if (typeof item === 'string' && item.trim().length > 2) {
                        const cleaned = sanitizeHint(item, 40);
                        if (cleaned) terms.push(cleaned);
                    }
                });
            }
        });
    } catch {
        // Metadata parsing is best-effort
    }

    return Array.from(new Set(terms)).slice(0, 4);
}

/**
 * Analyze dominant color channels and brightness to detect broad environmental cues.
 */
async function extractEnvironmentCues(buffer) {
    const cues = [];
    try {
        const stats = await sharp(buffer)
            .resize(200, 200, { fit: 'inside' })
            .stats();

        const channels = stats.channels;
        if (channels && channels.length >= 3) {
            const r = channels[0].mean;
            const g = channels[1].mean;
            const b = channels[2].mean;

            // Green vegetation / forest
            if (g > r * 1.15 && g > b * 1.15 && g > 60) {
                cues.push('nature/vegetation');
            }
            // Blue sky or marine/water
            else if (b > r * 1.2 && b > g * 1.05 && b > 70) {
                cues.push('sky/water');
            }
            // Warm golden / savanna / desert earth
            else if (r > 130 && g > 95 && b < 85) {
                cues.push('savanna/warm-earth');
            }
            // Low-light / night
            else if ((r + g + b) / 3 < 45) {
                cues.push('low-light/night');
            }
        }
    } catch {
        // Image stats are best-effort
    }

    return cues;
}

/**
 * Infer all available contextual search hints for an image.
 *
 * @param {Buffer} buffer Original image bytes
 * @param {string} [originalName] Filename from upload
 * @returns {Promise<{ keywords: string[], metadataTerms: string[], environment: string[], combinedHint: string }>}
 */
async function inferHints(buffer, originalName = '') {
    const fnTerms = extractFromFilename(originalName);
    const metaTerms = buffer ? await extractFromMetadata(buffer) : [];
    const envCues = buffer ? await extractEnvironmentCues(buffer) : [];

    const allKeywords = Array.from(new Set([...fnTerms, ...metaTerms]));
    const combinedHint = allKeywords.slice(0, 3).join(' ') || (envCues[0] || '');

    return {
        keywords: allKeywords,
        metadataTerms: metaTerms,
        environment: envCues,
        combinedHint
    };
}

module.exports = {
    inferHints,
    extractFromFilename,
    extractFromMetadata,
    extractEnvironmentCues
};

