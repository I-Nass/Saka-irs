/**
 * Smoke test — exercises the real fingerprint pipeline without MongoDB.
 *
 * Builds synthetic images with sharp:
 *   A   — gradient base image
 *   A2  — A re-encoded at a different size/quality (near duplicate)
 *   B   — visually unrelated noise image
 *
 * Asserts: d(A,A) === 0 · d(A,A2) low · d(A,B) clearly higher.
 * Run with:  node --test tests/
 */

const test = require('node:test');
const assert = require('node:assert');

const sharp = require('sharp');
const FingerprintService = require('../services/FingerprintService');
const { hammingDistanceHex } = require('../utils/hamming');
const { classifyLocalMatch } = require('../utils/ranking');

async function makeGradient() {
    const svg = Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480">
           <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
             <stop offset="0%" stop-color="#204a87"/>
             <stop offset="100%" stop-color="#e8b339"/>
           </linearGradient></defs>
           <rect width="640" height="480" fill="url(#g)"/>
           <circle cx="200" cy="180" r="90" fill="#ffffff" opacity="0.85"/>
           <rect x="380" y="260" width="180" height="140" fill="#1c3314"/>
         </svg>`
    );
    return sharp(svg).png().toBuffer();
}

async function makeNoise() {
    const svg = Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480">
           <rect width="640" height="480" fill="#000000"/>
         </svg>`
    );
    // Pseudo-random checker mosaic — structurally unrelated to the gradient.
    const rects = [];
    let seed = 42;
    for (let i = 0; i < 60; i++) {
        seed = (seed * 1103515245 + 12345) % 2147483648;
        const x = seed % 600;
        seed = (seed * 1103515245 + 12345) % 2147483648;
        const y = seed % 420;
        seed = (seed * 1103515245 + 12345) % 2147483648;
        const c = ['#ff0044', '#00cc88', '#ffee00', '#3300ff'][seed % 4];
        rects.push(`<rect x="${x}" y="${y}" width="60" height="40" fill="${c}"/>`);
    }
    const noisy = Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480">
           ${rects.join('')}
         </svg>`
    );
    return sharp(noisy).png().toBuffer();
}

test('identical image hashes to distance 0 against itself', async () => {
    const buf = await makeGradient();
    const { rawBuffer } = await FingerprintService.normalize(buf);
    const h = FingerprintService.fingerprints(rawBuffer);

    assert.equal(hammingDistanceHex(h.phash, h.phash), 0);
    assert.equal(hammingDistanceHex(h.dhash, h.dhash), 0);
    assert.equal(hammingDistanceHex(h.ahash, h.ahash), 0);
    assert.match(h.phash, /^[0-9a-f]{16}$/);
});

test('re-encoded resize stays a NEAR DUPLICATE (low distance)', async () => {
    const original = await makeGradient();
    const variant = await sharp(original)
        .resize(512, 384)
        .jpeg({ quality: 55 })
        .toBuffer();

    const a = FingerprintService.fingerprints(
        (await FingerprintService.normalize(original)).rawBuffer
    );
    const b = FingerprintService.fingerprints(
        (await FingerprintService.normalize(variant)).rawBuffer
    );

    const phashDist = hammingDistanceHex(a.phash, b.phash);
    const dhashDist = hammingDistanceHex(a.dhash, b.dhash);

    assert.ok(phashDist <= 12, `pHash distance too high for near-duplicate: ${phashDist}`);
    assert.ok(dhashDist <= 12, `dHash distance too high for near-duplicate: ${dhashDist}`);

    const cls = classifyLocalMatch({
        phashDist,
        dhashDist,
        contentMatch: false
    });
    assert.ok(['exact_duplicate', 'near_duplicate'].includes(cls.matchType));
});

test('unrelated images score clearly higher than duplicates', async () => {
    const gradBuf = await makeGradient();
    const noiseBuf = await makeNoise();

    const a = FingerprintService.fingerprints(
        (await FingerprintService.normalize(gradBuf)).rawBuffer
    );
    const b = FingerprintService.fingerprints(
        (await FingerprintService.normalize(noiseBuf)).rawBuffer
    );

    const phashDist = hammingDistanceHex(a.phash, b.phash);

    assert.ok(
        phashDist > 12,
        `unrelated pHash distance unexpectedly low: ${phashDist}`
    );

    const cls = classifyLocalMatch({
        phashDist,
        dhashDist: hammingDistanceHex(a.dhash, b.dhash),
        contentMatch: false
    });
    assert.notEqual(cls.confidence, 'strong');
});
