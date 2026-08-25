/**
 * Image controller — Index flow endpoints (documentation §34).
 */

const path = require('path');

const StorageService = require('../services/StorageService');
const ImageService = require('../services/ImageService');
const { sanitizeHints } = require('../utils/sanitize');

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

module.exports = { indexImage, getImage, getThumbnail, deleteImage, listImages };
