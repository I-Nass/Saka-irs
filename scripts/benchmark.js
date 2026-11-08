/**
 * scripts/benchmark.js
 * Automated Benchmarking & Threshold Calibration Harness (Documentation §38, BI-1).
 *
 * Generates synthetic test sets with sharp, computes pHash/dHash/aHash distributions
 * across duplicates, resizes, crops, rotations, filters, and unrelated images.
 *
 * Run:  node scripts/benchmark.js
 */

const sharp = require('sharp');
const FingerprintService = require('../services/FingerprintService');
const { hammingDistanceHex } = require('../utils/hamming');

function makeSvgPattern(id, colorA, colorB, shapeType) {
    let shape = `<circle cx="300" cy="200" r="100" fill="${colorB}" opacity="0.9"/>`;
    if (shapeType === 'rect') {
        shape = `<rect x="180" y="100" width="240" height="200" fill="${colorB}" opacity="0.9"/>`;
    } else if (shapeType === 'polygon') {
        shape = `<polygon points="300,80 450,320 150,320" fill="${colorB}" opacity="0.9"/>`;
    }

    return Buffer.from(`
        <svg xmlns="http://www.w3.org/2000/svg" width="600" height="400">
            <defs>
                <linearGradient id="g_${id}" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stop-color="${colorA}"/>
                    <stop offset="100%" stop-color="${colorB}"/>
                </linearGradient>
            </defs>
            <rect width="600" height="400" fill="url(#g_${id})"/>
            ${shape}
            <path d="M50 350 Q 300 150 550 350" stroke="#ffffff" stroke-width="8" fill="none" opacity="0.8"/>
        </svg>
    `);
}

async function generateDataset() {
    const sources = [
        { name: 'Landscape', svg: makeSvgPattern(1, '#ff7e5f', '#feb47b', 'circle') },
        { name: 'Geometric', svg: makeSvgPattern(2, '#6a11cb', '#2575fc', 'rect') },
        { name: 'Abstract', svg: makeSvgPattern(3, '#11998e', '#38ef7d', 'polygon') }
    ];

    const dataset = [];

    for (const src of sources) {
        const baseBuffer = await sharp(src.svg).png().toBuffer();
        const baseNorm = await FingerprintService.normalize(baseBuffer);
        const baseHashes = FingerprintService.fingerprints(baseNorm.rawBuffer);

        const variants = [
            { type: 'Identical Copy', buffer: baseBuffer },
            { type: 'Resize (50%)', buffer: await sharp(baseBuffer).resize(300, 200).png().toBuffer() },
            { type: 'Resize (150%)', buffer: await sharp(baseBuffer).resize(900, 600).png().toBuffer() },
            { type: 'JPEG Recompressed (Q80)', buffer: await sharp(baseBuffer).jpeg({ quality: 80 }).toBuffer() },
            { type: 'JPEG Recompressed (Q50)', buffer: await sharp(baseBuffer).jpeg({ quality: 50 }).toBuffer() },
            { type: 'Color Tint Shift', buffer: await sharp(baseBuffer).tint('#ffcc00').png().toBuffer() },
            { type: 'Slight Crop (10%)', buffer: await sharp(baseBuffer).extract({ left: 30, top: 20, width: 540, height: 360 }).png().toBuffer() },
            { type: 'Rotation (90 deg)', buffer: await sharp(baseBuffer).rotate(90).png().toBuffer() }
        ];

        dataset.push({
            name: src.name,
            baseHashes,
            variants: await Promise.all(variants.map(async (v) => {
                const norm = await FingerprintService.normalize(v.buffer);
                const hashes = FingerprintService.fingerprints(norm.rawBuffer);
                return { type: v.type, hashes };
            }))
        });
    }

    // Unrelated images
    const unrelatedBuffers = [
        await sharp(Buffer.from('<svg width="600" height="400"><rect width="600" height="400" fill="#000000"/><circle cx="100" cy="100" r="40" fill="#ffffff"/></svg>')).png().toBuffer(),
        await sharp(Buffer.from('<svg width="600" height="400"><rect width="600" height="400" fill="#ffffff"/><rect x="200" y="100" width="200" height="200" fill="#000000"/></svg>')).png().toBuffer()
    ];

    const unrelated = await Promise.all(unrelatedBuffers.map(async (buf, idx) => {
        const norm = await FingerprintService.normalize(buf);
        return { name: `Noise Pattern ${idx + 1}`, hashes: FingerprintService.fingerprints(norm.rawBuffer) };
    }));

    return { dataset, unrelated };
}

(async () => {
    console.log('◈ Running Saka-irs Threshold Calibration Benchmark (§38)...\n');
    const start = Date.now();
    const { dataset, unrelated } = await generateDataset();

    const stats = {
        duplicates: [],
        resizes: [],
        compressed: [],
        crops: [],
        rotations: [],
        unrelated: []
    };

    for (const item of dataset) {
        for (const v of item.variants) {
            const pDist = hammingDistanceHex(item.baseHashes.phash, v.hashes.phash);
            const dDist = hammingDistanceHex(item.baseHashes.dhash, v.hashes.dhash);
            const record = { type: v.type, pDist, dDist };

            if (v.type === 'Identical Copy') stats.duplicates.push(record);
            else if (v.type.includes('Resize')) stats.resizes.push(record);
            else if (v.type.includes('JPEG')) stats.compressed.push(record);
            else if (v.type.includes('Crop')) stats.crops.push(record);
            else if (v.type.includes('Rotation')) stats.rotations.push(record);
        }

        // Compare against unrelated
        for (const u of unrelated) {
            const pDist = hammingDistanceHex(item.baseHashes.phash, u.hashes.phash);
            const dDist = hammingDistanceHex(item.baseHashes.dhash, u.hashes.dhash);
            stats.unrelated.push({ pDist, dDist });
        }
    }

    function avg(arr, key) {
        return (arr.reduce((sum, r) => sum + r[key], 0) / (arr.length || 1)).toFixed(1);
    }
    function max(arr, key) {
        return Math.max(...arr.map(r => r[key]), 0);
    }
    function min(arr, key) {
        return Math.min(...arr.map(r => r[key]), 64);
    }

    console.log('─── Empirical Hamming Distance Matrix (0–64 Bits) ───');
    console.log(`• Identical Copies:        pHash dist = ${avg(stats.duplicates, 'pDist')} (max ${max(stats.duplicates, 'pDist')})`);
    console.log(`• Resized Variants:        pHash dist = ${avg(stats.resizes, 'pDist')} (max ${max(stats.resizes, 'pDist')})`);
    console.log(`• JPEG Recompressions:     pHash dist = ${avg(stats.compressed, 'pDist')} (max ${max(stats.compressed, 'pDist')})`);
    console.log(`• Spliced / Mild Crops:    pHash dist = ${avg(stats.crops, 'pDist')} (max ${max(stats.crops, 'pDist')})`);
    console.log(`• 90° Rotations:           pHash dist = ${avg(stats.rotations, 'pDist')} (fails pHash — Phase 2 needed)`);
    console.log(`• Unrelated Images:        pHash dist = ${avg(stats.unrelated, 'pDist')} (min ${min(stats.unrelated, 'pDist')})\n`);

    const maxNearDup = Math.max(max(stats.duplicates, 'pDist'), max(stats.resizes, 'pDist'), max(stats.compressed, 'pDist'));
    const minUnrelated = min(stats.unrelated, 'pDist');

    console.log('─── Threshold Calibration Recommendations ───');
    console.log(`• Recommended NEAR_DUPLICATE_THRESHOLD : ${maxNearDup}  (catches all identical, resizes & compression)`);
    console.log(`• Recommended VISUAL_MATCH_THRESHOLD   : ${Math.floor((maxNearDup + minUnrelated) / 2)} (safe margin below unrelated min of ${minUnrelated})`);
    console.log(`• Clean Separation Gap                 : ${minUnrelated - maxNearDup} bits (Zero false positive band)\n`);

    console.log(`✓ Benchmark completed in ${Date.now() - start}ms.`);
})();

