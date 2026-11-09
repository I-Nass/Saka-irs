/**
 * FingerprintService — normalization (§14) + fingerprint generation (§15).
 *
 * Normalization rules R1–R6 are enforced HERE, centrally:
 *   R1  hashes derive from the normalized derivative, never the original
 *   R2  EXIF orientation corrected first via sharp .rotate() (no args)
 *   R3  alpha flattened onto a fixed white background
 *   R4  fixed resize: 32×32 grayscale for the hash buffer
 *   R5  single kernel everywhere (sharp default lanczos)
 *   R6  ONE raw pixel buffer feeds pHash/dHash/aHash
 *
 * Sanitization note (§20/§30): every sharp re-encode here strips all EXIF
 * including GPS — `.withMetadata()` is deliberately never called.
 */

const sharp = require('sharp');
const hashing = require('../utils/hashing');

const RAW_SIZE = hashing.RAW_SIZE; // 32

/**
 * Normalize an ORIGINAL image buffer.
 * @returns {Promise<{ rawBuffer: Buffer, normalizedWebp: Buffer }>}
 */
async function normalize(originalBuffer) {
    const pipeline = sharp(originalBuffer)
        .rotate()                                  // R2 — auto-orient via EXIF
        .flatten({ background: '#ffffff' })        // R3 — kill alpha
        .grayscale();

    const rawBuffer = await pipeline
        .clone()
        .resize(RAW_SIZE, RAW_SIZE)                // R4/R5
        .raw()
        .toBuffer();

    const normalizedWebp = await pipeline
        .clone()
        .webp({ quality: 85 })
        .toBuffer();                               // EXIF stripped by default (§30)

    if (rawBuffer.length !== RAW_SIZE * RAW_SIZE) {
        throw new Error('Normalization produced an unexpected buffer size.');
    }

    return { rawBuffer, normalizedWebp };
}

/**
 * Generate the 256px WebP display thumbnail from the ORIGINAL buffer
 * (orientation-corrected + flattened like everything else).
 */
async function makeThumbnail(originalBuffer) {
    return sharp(originalBuffer)
        .rotate()
        .flatten({ background: '#ffffff' })
        .resize(256, 256, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer();
}

/**
 * All three fingerprints from one shared raw buffer (R6).
 * @returns {{ phash: string, dhash: string, ahash: string }} hex strings
 */
function fingerprints(rawBuffer) {
    return hashing.fingerprintsFromRaw(rawBuffer);
}

/**
 * Build a small, metadata-stripped JPEG suitable for an external upload.
 *
 * Two hard constraints are enforced by the APIs we talk to:
 *   trace.moe  — accepts a multipart upload of a normal photo
 *   SerpApi     — Image API rejects anything over 500 KB (JPG/PNG/WebP)
 *
 * The derivative is produced by sharp WITHOUT `.withMetadata()`, so EXIF, GPS
 * and colour profiles are gone before the bytes leave the machine (§30).
 *
 * @param {Buffer} originalBuffer original file bytes
 * @param {{maxDim?:number, maxBytes?:number}} [opts]
 * @returns {Promise<Buffer>} JPEG buffer under maxBytes
 */
async function makeUploadDerivative(originalBuffer, { maxDim = 900, maxBytes = 500 * 1024 } = {}) {
    const build = (dimension, quality) => sharp(originalBuffer)
        .rotate()
        .flatten({ background: '#ffffff' })
        .resize(dimension, dimension, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality })
        .toBuffer();

    // First try to keep the requested resolution and trade quality instead.
    for (const quality of [85, 75, 65, 55, 45]) {
        const buffer = await build(maxDim, quality);
        if (buffer.length <= maxBytes) return buffer;
    }

    // Still too large — step the long edge down and retry.
    let dimension = maxDim;
    for (let step = 0; step < 4; step++) {
        dimension = Math.max(320, Math.round(dimension * 0.7));
        for (const quality of [80, 65, 50]) {
            const buffer = await build(dimension, quality);
            if (buffer.length <= maxBytes) return buffer;
        }
    }

    throw new Error('Could not compress the image under the external upload limit.');
}

module.exports = { normalize, makeThumbnail, fingerprints, makeUploadDerivative, RAW_SIZE };
