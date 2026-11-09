/**
 * PivotService — manual reverse-image pivots.
 *
 * The general-web reverse-image engines have no usable public API:
 * Google Lens has none, Yandex has none, Bing Visual Search was retired in
 * Aug 2025, and TinEye's terms forbid scripted searching. What all of them DO
 * support is a human upload in a browser tab.
 *
 * So instead of scraping them (ToS violation, IP bans, permanent maintenance),
 * Saka-irs hands the user a metadata-stripped PNG and opens the engine. The
 * upload happens in the user's own browser session — our server never
 * transmits the image, which is why this is the one "external" feature that
 * keeps the local-first promise intact.
 *
 * Engines are served from the backend so the client and the docs can't drift.
 */

const sharp = require('sharp');

/** Long edge for the pivot derivative. Big enough for Lens/Yandex detail. */
const PIVOT_MAX_DIM = Math.min(
    Math.max(parseInt(process.env.PIVOT_MAX_DIM || '1280', 10) || 1280, 320),
    2400
);

const ENGINES = [
    {
        id: 'google-lens',
        label: 'Google Lens',
        url: 'https://lens.google.com/',
        accepts: 'Ctrl+V after the tab opens',
        coverage: 'General web · phones, objects, landmarks, text',
        best: true
    },
    {
        id: 'yandex',
        label: 'Yandex Images',
        url: 'https://yandex.com/images/',
        accepts: 'Ctrl+V after the tab opens',
        coverage: 'General web · strong on faces, Eastern Europe, obscure photos'
    },
    {
        id: 'tineye',
        label: 'TinEye',
        url: 'https://tineye.com/',
        accepts: 'Ctrl+V, or drop the downloaded PNG',
        coverage: 'Oldest copy, modified versions, stock-photo detection'
    },
    {
        id: 'saucenao',
        label: 'SauceNAO',
        url: 'https://saucenao.com/',
        accepts: 'Upload the PNG (file picker)',
        coverage: 'Anime, manga and illustration sources (Pixiv, Danbooru)'
    },
    {
        id: 'trace-moe',
        label: 'trace.moe',
        url: 'https://trace.moe/',
        accepts: 'Ctrl+V, or upload the PNG',
        coverage: 'Anime episode + timestamp (also available automatically)'
    }
];

const NOTE = 'Saka-irs copies a metadata-stripped PNG to your clipboard and opens the engine. ' +
    'Your browser performs the upload — this server never sends the image anywhere. ' +
    'Each engine has its own terms and retention policy.';

/**
 * Render the pivot derivative: orientation-corrected, alpha-flattened,
 * EXIF-stripped PNG. PNG is deliberate — the async clipboard API rejects WebP
 * in Chromium, and PNG is the format every engine accepts.
 *
 * Generated on demand rather than stored, so no new storage directory exists
 * for the retention sweeper to miss.
 */
async function renderPivotPng(originalBuffer) {
    return sharp(originalBuffer)
        .rotate()
        .flatten({ background: '#ffffff' })
        .resize(PIVOT_MAX_DIM, PIVOT_MAX_DIM, { fit: 'inside', withoutEnlargement: true })
        .png({ compressionLevel: 6 })
        .toBuffer();
}

module.exports = { ENGINES, NOTE, renderPivotPng, PIVOT_MAX_DIM };
