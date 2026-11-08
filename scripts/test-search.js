/**
 * End-to-end Search Test:
 * 1. Indexes a synthetic image into the local library (POST /api/images).
 * 2. Searches using a re-encoded variant + contextual hints (POST /api/search).
 * 3. Inspects and prints local match results AND external corpus results.
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

async function createSampleImages() {
    const testDir = path.join(__dirname, '..', 'storage', 'temporary');
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });

    // Generate base image (sunset landscape motif)
    const baseSvg = Buffer.from(`
        <svg xmlns="http://www.w3.org/2000/svg" width="600" height="400">
            <defs>
                <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="#ff7e5f"/>
                    <stop offset="100%" stop-color="#feb47b"/>
                </linearGradient>
            </defs>
            <rect width="600" height="400" fill="url(#sky)"/>
            <circle cx="300" cy="200" r="80" fill="#ffffff" opacity="0.9"/>
            <path d="M0 400 L200 250 L350 350 L500 220 L600 400 Z" fill="#2d3436"/>
        </svg>
    `);

    const originalPath = path.join(testDir, 'sample_safari_original.png');
    await sharp(baseSvg).png().toFile(originalPath);

    // Generate query image (slightly resized & re-encoded to JPEG - near duplicate)
    const queryPath = path.join(testDir, 'query_safari_variant.jpg');
    await sharp(baseSvg).resize(480, 320).jpeg({ quality: 85 }).toFile(queryPath);

    return { originalPath, queryPath };
}

async function uploadForm(url, filePath, fields = {}) {
    const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
    const fileBuffer = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);
    const mimeType = fileName.endsWith('.png') ? 'image/png' : 'image/jpeg';

    const chunks = [];

    // File part
    chunks.push(Buffer.from(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="image"; filename="${fileName}"\r\n` +
        `Content-Type: ${mimeType}\r\n\r\n`
    ));
    chunks.push(fileBuffer);
    chunks.push(Buffer.from('\r\n'));

    // Field parts
    for (const [key, value] of Object.entries(fields)) {
        chunks.push(Buffer.from(
            `--${boundary}\r\n` +
            `Content-Disposition: form-data; name="${key}"\r\n\r\n` +
            `${value}\r\n`
        ));
    }

    chunks.push(Buffer.from(`--${boundary}--\r\n`));
    const payload = Buffer.concat(chunks);

    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
            'Content-Length': payload.length
        },
        body: payload
    });

    const text = await res.text();
    try {
        return { status: res.status, data: JSON.parse(text) };
    } catch {
        return { status: res.status, raw: text };
    }
}

async function runTest() {
    console.log('◈ Preparing synthetic test images...');
    const { originalPath, queryPath } = await createSampleImages();

    console.log('\n[Step 1] Indexing image into Local Library (POST /api/images)...');
    const indexRes = await uploadForm('http://localhost:3000/api/images', originalPath, {
        name: 'Savanna Sunset',
        location: 'Tsavo National Park'
    });

    if (indexRes.status !== 201 && indexRes.status !== 200) {
        console.error('Failed to index image:', indexRes);
        process.exit(1);
    }
    console.log(`✓ Indexed successfully! Image ID: ${indexRes.data.image.id}`);
    console.log(`  Title: ${indexRes.data.image.originalName}`);
    console.log(`  pHash: ${indexRes.data.image.hashes.phash}`);

    console.log('\n[Step 2] Searching with variant image + external hint (POST /api/search)...');
    console.log('  Query Image: 480x320 JPEG variant');
    console.log('  Context Hint: keyword="safari", location="Kenya"');

    const searchRes = await uploadForm('http://localhost:3000/api/search', queryPath, {
        keyword: 'safari',
        location: 'Kenya'
    });

    console.log(`\n◈ Search Response: HTTP ${searchRes.status} (${searchRes.data.durationMs}ms)`);
    console.log('Providers Status:', JSON.stringify(searchRes.data.providers, null, 2));

    const cats = searchRes.data.categories || {};
    console.log('\n─── 1. Exact / Near Duplicates (Local) ───');
    if (cats.duplicates && cats.duplicates.length > 0) {
        cats.duplicates.forEach(d => {
            console.log(`  ✓ Match: "${d.title}" | Provider: ${d.provider} | Type: ${d.matchType} | Confidence: ${d.confidence} | pHash Dist: ${d.distance}`);
        });
    } else {
        console.log('  (No local duplicates)');
    }

    console.log('\n─── 2. Web Discovery / External Corpus (Openverse) ───');
    if (cats.discovery && cats.discovery.length > 0) {
        console.log(`  Found ${cats.discovery.length} external archive matches:`);
        cats.discovery.slice(0, 4).forEach((c, idx) => {
            console.log(`  [${idx + 1}] "${c.title}"`);
            console.log(`      Creator: ${c.metadata.creator || 'Unknown'} | License: ${c.metadata.license}`);
            console.log(`      Source: ${c.sourceUrl}`);
            console.log(`      Thumbnail: ${c.imageUrl}`);
        });
    } else {
        console.log('  (No external discovery results)');
    }

    console.log('\n[Step 3] Testing search with zero manual hints (testing filename fallback)...');
    const noHintRes = await uploadForm('http://localhost:3000/api/search', queryPath, {});
    console.log(`Providers Status (No Hints):`, JSON.stringify(noHintRes.data.providers, null, 2));
    console.log(`Discovery Results Count:`, noHintRes.data.categories?.discovery?.length || 0);

    console.log('\n✓ E2E Search Test Completed Successfully!');
}

runTest().catch(console.error);

