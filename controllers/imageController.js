/**
 * Image controller — Index flow endpoints (documentation §34).
 */

const path = require('path');
const fs = require('fs/promises');

const StorageService = require('../services/StorageService');
const ImageService = require('../services/ImageService');
const PivotService = require('../services/PivotService');
const { sanitizeHints } = require('../utils/sanitize');
const { generateELA } = require('../utils/forensics');

/** POST /api/images — add an image to the indexed library. */
async function indexImage(req, res, next) {
    try {
        const hints = sanitizeHints(req.body);
        const { image } = await ImageService.indexImage(req.upload, hints);
        return res.status(201).json({
            message: 'Image added to library.',
            image
        });
    } catch (err) {
        return next(err);
    }
}

/** GET /api/images/:id — public-safe record. */
async function getImage(req, res, next) {
    try {
        const doc = await ImageService.getImageDoc(req.params.id);
        return res.json({ image: ImageService.publicImage(doc) });
    } catch (err) {
        return next(err);
    }
}

/** GET /api/images/:id/thumbnail — serve the stored thumbnail file. */
async function getThumbnail(req, res, next) {
    try {
        const doc = await ImageService.getImageDoc(req.params.id);
        if (!doc.thumbnailPath) {
            return res.status(404).json({ error: { status: 404, message: 'No thumbnail for this image.' } });
        }
        return res.sendFile(path.resolve(doc.thumbnailPath));
    } catch (err) {
        return next(err);
    }
}

/** DELETE /api/images/:id — remove record + owned files. */
async function deleteImage(req, res, next) {
    try {
        await ImageService.deleteImage(req.params.id);
        return res.json({ deleted: true });
    } catch (err) {
        return next(err);
    }
}

/** GET /api/images — paginated library listing + stats (BI-2). */
async function listImages(req, res, next) {
    try {
        const data = await ImageService.listLibrary({
            limit: req.query.limit,
            offset: req.query.offset
        });
        return res.json(data);
    } catch (err) {
        return next(err);
    }
}

/** GET /api/images/:id/ela — generate & serve Error Level Analysis for a stored image. */
async function getForensicELA(req, res, next) {
    try {
        const doc = await ImageService.getImageDoc(req.params.id);
        const targetPath = doc.storagePath || doc.thumbnailPath;
        if (!targetPath) {
            return res.status(404).json({ error: { status: 404, message: 'Image file not found.' } });
        }
        const buffer = await fs.readFile(targetPath);
        const quality = Math.min(100, Math.max(50, parseInt(req.query.quality, 10) || 90));
        const scale = Math.min(50, Math.max(1, parseInt(req.query.scale, 10) || 20));
        const elaBuffer = await generateELA(buffer, { quality, scale });
        res.type('image/webp').send(elaBuffer);
    } catch (err) {
        return next(err);
    }
}

/**
 * GET /api/pivot/engines — the manual reverse-image pivot targets.
 *
 * Served from the backend so the UI and the docs cannot drift apart, and so a
 * new engine is a one-line change on the server.
 */
function getPivotEngines(_req, res) {
    return res.json({
        engines: PivotService.ENGINES,
        note: PivotService.NOTE,
        maxDimension: PivotService.PIVOT_MAX_DIM
    });
}

/**
 * GET /api/images/:id/pivot.png — metadata-stripped PNG for a manual pivot.
 *
 * Generated on demand (no new storage directory means nothing for the
 * retention sweeper to miss) and never cached beyond the browser, because the
 * point is to hand the user the newest sanitized copy.
 */
async function getPivotImage(req, res, next) {
    try {
        const doc = await ImageService.getImageDoc(req.params.id);
        const targetPath = doc.storagePath || doc.thumbnailPath;
        if (!targetPath) {
            return res.status(404).json({ error: { status: 404, message: 'Image file not found.' } });
        }

        const buffer = await fs.readFile(targetPath);
        const png = await PivotService.renderPivotPng(buffer);

        res.set('Cache-Control', 'private, max-age=300');
        return res.type('image/png').send(png);
    } catch (err) {
        return next(err);
    }
}

/** POST /api/forensics/ela — direct ELA generation from upload. */
async function computeUploadELA(req, res, next) {
    try {
        if (!req.upload || !req.upload.buffer) {
            return res.status(400).json({ error: { status: 400, message: 'No image uploaded.' } });
        }
        const quality = Math.min(100, Math.max(50, parseInt(req.body.quality, 10) || 90));
        const scale = Math.min(50, Math.max(1, parseInt(req.body.scale, 10) || 20));
        const elaBuffer = await generateELA(req.upload.buffer, { quality, scale });
        res.type('image/webp').send(elaBuffer);
    } catch (err) {
        return next(err);
    }
}

module.exports = {
    indexImage,
    getImage,
    getThumbnail,
    deleteImage,
    listImages,
    getForensicELA,
    computeUploadELA,
    getPivotEngines,
    getPivotImage
};
