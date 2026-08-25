/**
 * ImageService — the two primary pipelines (documentation §10–12).
 *
 *   indexImage()  POST /api/images  → validate → normalize → fingerprint
 *                 → thumbnail → persist record + files ("Add to Library")
 *   stageQuery()  POST /api/search  → validate → normalize → fingerprint
 *                 → persist a short-lived query copy (role: "query")
 *
 * Validation already ran in middleware/validation.js; this service starts
 * from req.upload = { buffer, mimeType, width, height, size, originalName }.
 */

const crypto = require('crypto');

const sharp = require('sharp');

const Image = require('../models/Image');
const StorageService = require('./StorageService');
const FingerprintService = require('./FingerprintService');
const MetadataService = require('./MetadataService');
const { safeDisplayName } = require('../utils/sanitize');

function retentionFromNow(days) {
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

function publicImage(doc) {
    // Never expose filesystem paths or raw GPS to clients.
    return {
        id: String(doc._id),
        originalName: doc.originalName,
        role: doc.role,
        mimeType: doc.mimeType,
        size: doc.size,
        width: doc.width,
        height: doc.height,
        hashes: doc.hashes,
        contentHash: doc.contentHash ? doc.contentHash.slice(0, 12) + '…' : null,
        metadata: doc.metadata,
        thumbnailUrl: `/api/images/${String(doc._id)}/thumbnail`,
        createdAt: doc.createdAt,
        expiresAt: doc.expiresAt
    };
}

/** Full ingest into the searchable library. */
async function indexImage(upload, hints) {
    const { buffer } = upload;
    const uuid = crypto.randomUUID();
    const ext = upload.mimeType.split('/')[1] || 'bin';

    const { rawBuffer, normalizedWebp } = await FingerprintService.normalize(buffer);
    const hashes = FingerprintService.fingerprints(rawBuffer);
    const thumbnail = await FingerprintService.makeThumbnail(buffer);
    const metadata = await MetadataService.extract(buffer);

    const storagePath = await StorageService.persistOriginal(buffer, uuid, ext);
    const normalizedPath = await StorageService.persistNormalized(normalizedWebp, uuid);
    const thumbnailPath = await StorageService.persistThumbnail(thumbnail, uuid);

    const retentionDays = parseInt(process.env.RETENTION_DAYS || '7', 10);

    const doc = await Image.create({
        originalName: safeDisplayName(upload.originalName),
        role: 'library',
        storagePath,
        normalizedPath,
        thumbnailPath,
        mimeType: upload.mimeType,
        size: upload.size,
        width: upload.width,
        height: upload.height,
        hashes,
        contentHash: crypto.createHash('sha256').update(buffer).digest('hex'),
        metadata,
        expiresAt: retentionFromNow(retentionDays)
    });

    return { image: publicImage(doc), hints: hints || {} };
}

/**
 * Prepare a search query: fingerprints only + a 24h query copy so the
 * Search history can still render its thumbnail later.
 */
async function stageQuery(upload) {
    const { buffer } = upload;
    const uuid = crypto.randomUUID();
    const ext = upload.mimeType.split('/')[1] || 'bin';

    const { rawBuffer } = await FingerprintService.normalize(buffer);
    const hashes = FingerprintService.fingerprints(rawBuffer);
    const thumbnail = await FingerprintService.makeThumbnail(buffer);

    const storagePath = await StorageService.persistOriginal(buffer, uuid, ext);
    const thumbnailPath = await StorageService.persistThumbnail(thumbnail, uuid);

    const hours = parseInt(process.env.QUERY_RETENTION_HOURS || '24', 10);
    const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);

    const doc = await Image.create({
        originalName: safeDisplayName(upload.originalName),
        role: 'query',
        storagePath,
        normalizedPath: null,
        thumbnailPath,
        mimeType: upload.mimeType,
        size: upload.size,
        width: upload.width,
        height: upload.height,
        hashes,
        contentHash: crypto.createHash('sha256').update(buffer).digest('hex'),
        metadata: await MetadataService.extract(buffer),
        expiresAt
    });

    return {
        queryImageId: String(doc._id),
        hashes,
        contentHash: doc.contentHash
    };
}

/** Fetch a document for file serving / detail views. */
async function getImageDoc(id) {
    if (!/^[0-9a-f]{24}$/i.test(String(id))) {
        const err = new Error('Invalid image id.');
        err.status = 400;
        throw err;
    }
    const doc = await Image.findById(id).lean();
    if (!doc) {
        const err = new Error('Image not found.');
        err.status = 404;
        throw err;
    }
    return doc;
}

async function deleteImage(id) {
    const doc = await getImageDoc(id);
    await StorageService.deleteImageFiles(doc);
    await Image.deleteOne({ _id: doc._id });
    return true;
}

/** Sanity helper used by boot-time checks in tests. */
async function pingSharpPipeline() {
    const out = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#123456' } })
        .webp()
        .toBuffer();
    return out.length > 0;
}

/**
 * Paginated library listing + aggregate stats (BI-2).
 * Only role:"library" documents belong in the browseable library.
 */
async function listLibrary({ limit, offset } = {}) {
    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 24, 1), 96);
    const safeOffset = Math.max(parseInt(offset, 10) || 0, 0);
    const filter = { role: 'library' };

    const [docs, total, agg] = await Promise.all([
        Image.find(filter).sort({ createdAt: -1 }).skip(safeOffset).limit(safeLimit).lean(),
        Image.countDocuments(filter),
        Image.aggregate([
            { $match: filter },
            { $group: { _id: null, count: { $sum: 1 }, bytes: { $sum: '$size' } } }
        ])
    ]);

    return {
        total,
        count: docs.length,
        offset: safeOffset,
        limit: safeLimit,
        stats: {
            count: agg.length > 0 ? agg[0].count : 0,
            bytes: agg.length > 0 ? agg[0].bytes : 0
        },
        images: docs.map(publicImage)
    };
}

module.exports = {
    indexImage,
    stageQuery,
    getImageDoc,
    deleteImage,
    publicImage,
    pingSharpPipeline,
    listLibrary
};

